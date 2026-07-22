// ============================================================
// CommandReconstructor — heuristic reconstruction of shell
// commands from raw xterm.js input byte sequences.
//
// IMPORTANT: This is a browser-side approximation only.
// It does NOT capture output-side echoing, history substitution,
// or any server-side line editing.  It is useful for displaying
// "what the user typed", but should never be treated as an
// authoritative audit log.
//
// Supported control sequences:
//   Printable ASCII    — insert at cursor position
//   Backspace          — \x08 or \x7f, delete char before cursor
//   Delete (forward)   — ESC[3~ (VT sequence)
//   Enter              — \r or \n, commit current line
//   Ctrl+C             — \x03, interrupt / reset current line
//   Ctrl+U             — \x15, kill line (clear current line)
//   Arrow Left/Right   — ESC[D / ESC[C, move cursor
//   Arrow Up/Down      — ESC[A / ESC[B, ignored (history navigation)
//   Home / End         — ESC[H / ESC[F or ESC[1~ / ESC[4~
//   Paste              — multi-character input, processed char-by-char
// ============================================================

export class CommandReconstructor {
  // Current line buffer
  private _currentLine = '';
  // Cursor position within _currentLine (0 = before first char)
  private _cursorPos = 0;
  // Committed commands (submitted by pressing Enter)
  private _reconstructedCommands: string[] = [];
  // Interruptions (Ctrl+C)
  private _interruptions: Array<{ partial: string; timestamp: string }> = [];

  // ------------------------------------------------------------------
  // processByte
  // ------------------------------------------------------------------

  /**
   * Process a single character or multi-character escape sequence
   * received from xterm.js's `onData` callback.
   *
   * xterm.js delivers:
   *   - printable chars as a single character string
   *   - control chars as their literal escape sequence string
   *   - paste as a contiguous multi-character string
   */
  processByte(data: string): void {
    if (data.length === 0) return;

    // Handle multi-char input (paste or escape sequences)
    if (data.length > 1) {
      this._processMultiChar(data);
      return;
    }

    this._processChar(data);
  }

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  private _processMultiChar(data: string): void {
    let i = 0;
    while (i < data.length) {
      const ch = data[i];

      // ESC — could be start of an escape sequence
      if (ch === '\x1b' && i + 1 < data.length) {
        const rest = data.slice(i);
        const consumed = this._tryConsumeEscapeSequence(rest);
        if (consumed > 0) {
          i += consumed;
          continue;
        }
        // Unknown ESC sequence — skip the ESC byte
        i += 1;
        continue;
      }

      this._processChar(ch);
      i += 1;
    }
  }

  private _tryConsumeEscapeSequence(s: string): number {
    // s starts with \x1b
    if (s.length < 2) return 0;

    if (s[1] === '[') {
      // CSI sequence: ESC [ ... final_byte
      // Final byte is in range 0x40–0x7E
      const csi = s.slice(2);
      const match = csi.match(/^([0-9;?]*)([A-Za-z~])/);
      if (!match) return 0;

      const param = match[1];
      const cmd = match[2];
      const totalLen = 2 + match[0].length; // ESC [ + content

      this._handleCsiCommand(param, cmd);
      return totalLen;
    }

    // SS3 sequence: ESC O [A-D] (cursor keys in application mode)
    if (s[1] === 'O' && s.length >= 3) {
      const ch = s[2];
      if (ch === 'A' || ch === 'B' || ch === 'C' || ch === 'D') {
        this._handleSs3ArrowKey(ch);
        return 3;
      }
    }

    return 0;
  }

  private _handleCsiCommand(param: string, cmd: string): void {
    switch (cmd) {
      case 'A': // Cursor Up — history navigation, ignore
      case 'B': // Cursor Down — history navigation, ignore
        break;

      case 'C': // Cursor Forward (Right)
        this._moveCursorRight();
        break;

      case 'D': // Cursor Back (Left)
        this._moveCursorLeft();
        break;

      case 'H': // Cursor Home (beginning of line)
        this._cursorPos = 0;
        break;

      case 'F': // Cursor End (end of line)
        this._cursorPos = this._currentLine.length;
        break;

      case '~': {
        // VT-style extended keys
        switch (param) {
          case '1': // Home
          case '7':
            this._cursorPos = 0;
            break;
          case '4': // End
          case '8':
            this._cursorPos = this._currentLine.length;
            break;
          case '3': // Delete (forward)
            this._deleteForward();
            break;
          // Other VT sequences ignored
        }
        break;
      }

      // All other CSI sequences ignored
    }
  }

  private _handleSs3ArrowKey(ch: string): void {
    switch (ch) {
      case 'A': // Up — ignore
      case 'B': // Down — ignore
        break;
      case 'C': // Right
        this._moveCursorRight();
        break;
      case 'D': // Left
        this._moveCursorLeft();
        break;
    }
  }

  private _processChar(ch: string): void {
    const code = ch.charCodeAt(0);

    // ---- Control characters ----

    if (ch === '\x7f' || ch === '\x08') {
      // Backspace — delete char before cursor
      this._backspace();
      return;
    }

    if (ch === '\r' || ch === '\n') {
      // Enter — commit the current line as a command
      this._commitLine();
      return;
    }

    if (ch === '\x03') {
      // Ctrl+C — interrupt, record partial line, reset
      this._interruptions.push({
        partial: this._currentLine,
        timestamp: new Date().toISOString(),
      });
      this._currentLine = '';
      this._cursorPos = 0;
      return;
    }

    if (ch === '\x15') {
      // Ctrl+U — kill to beginning of line
      this._currentLine = this._currentLine.slice(this._cursorPos);
      this._cursorPos = 0;
      return;
    }

    if (ch === '\x01') {
      // Ctrl+A — move to beginning of line
      this._cursorPos = 0;
      return;
    }

    if (ch === '\x05') {
      // Ctrl+E — move to end of line
      this._cursorPos = this._currentLine.length;
      return;
    }

    if (ch === '\x1b') {
      // Bare ESC — ignore (escape sequences handled in _processMultiChar)
      return;
    }

    // Skip other non-printable control characters (0x00–0x1f, 0x7f)
    if (code < 0x20 || code === 0x7f) {
      return;
    }

    // ---- Printable character — insert at cursor ----
    this._currentLine =
      this._currentLine.slice(0, this._cursorPos) +
      ch +
      this._currentLine.slice(this._cursorPos);
    this._cursorPos += 1;
  }

  // ------------------------------------------------------------------
  // Editing helpers
  // ------------------------------------------------------------------

  private _backspace(): void {
    if (this._cursorPos === 0) return;
    this._currentLine =
      this._currentLine.slice(0, this._cursorPos - 1) +
      this._currentLine.slice(this._cursorPos);
    this._cursorPos -= 1;
  }

  private _deleteForward(): void {
    if (this._cursorPos >= this._currentLine.length) return;
    this._currentLine =
      this._currentLine.slice(0, this._cursorPos) +
      this._currentLine.slice(this._cursorPos + 1);
  }

  private _moveCursorLeft(): void {
    if (this._cursorPos > 0) this._cursorPos -= 1;
  }

  private _moveCursorRight(): void {
    if (this._cursorPos < this._currentLine.length) this._cursorPos += 1;
  }

  private _commitLine(): void {
    const trimmed = this._currentLine.trim();
    if (trimmed.length > 0) {
      this._reconstructedCommands.push(trimmed);
    }
    this._currentLine = '';
    this._cursorPos = 0;
  }

  // ------------------------------------------------------------------
  // Public accessors
  // ------------------------------------------------------------------

  /**
   * Returns the last committed command, or `undefined` if none.
   */
  getLastCommand(): string | undefined {
    return this._reconstructedCommands[this._reconstructedCommands.length - 1];
  }

  /**
   * Returns all committed commands in chronological order.
   * The returned array is a shallow copy.
   */
  getCommands(): string[] {
    return [...this._reconstructedCommands];
  }

  /**
   * Returns the current in-progress (uncommitted) line buffer.
   * Useful for showing a live "you are typing" preview.
   */
  getCurrentLine(): string {
    return this._currentLine;
  }

  /**
   * Returns the current cursor position within the in-progress line.
   */
  getCursorPosition(): number {
    return this._cursorPos;
  }

  /**
   * Returns records of Ctrl+C interruptions with their partial lines.
   */
  getInterruptions(): Array<{ partial: string; timestamp: string }> {
    return [...this._interruptions];
  }

  /**
   * Resets all state (line buffer, cursor, command history).
   */
  reset(): void {
    this._currentLine = '';
    this._cursorPos = 0;
    this._reconstructedCommands = [];
    this._interruptions = [];
  }
}
