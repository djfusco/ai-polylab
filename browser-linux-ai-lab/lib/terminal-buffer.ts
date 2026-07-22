// ============================================================
// TerminalBuffer — in-memory store for terminal events and
// session transcript, with hard memory limits enforced.
//
// Limits (enforced):
//   Events    : max 2,000  (oldest dropped)
//   Transcript: max 100,000 chars (oldest chars dropped)
//   Commands  : max 50     (oldest dropped)
// ============================================================

import type {
  TerminalEvent,
  TerminalBufferState,
} from './v86-types';

// ------------------------------------------------------------------
// Hard limits
// ------------------------------------------------------------------

const MAX_EVENTS = 2_000;
const MAX_TRANSCRIPT_CHARS = 100_000;
const MAX_COMMANDS = 50;

// ------------------------------------------------------------------
// TerminalBuffer
// ------------------------------------------------------------------

export class TerminalBuffer {
  private _events: TerminalEvent[] = [];
  private _commands: Array<{ command: string; timestamp: string }> = [];
  private _transcript = '';
  private _sessionStartedAt: string;
  private _commandCount = 0;   // monotonic counter, not capped
  private _hintUsageCount = 0;
  private _lastActivityAt: string;

  constructor() {
    const now = new Date().toISOString();
    this._sessionStartedAt = now;
    this._lastActivityAt = now;
  }

  // ----------------------------------------------------------------
  // Core event helpers
  // ----------------------------------------------------------------

  private _now(): string {
    return new Date().toISOString();
  }

  private _pushEvent(event: TerminalEvent): void {
    this._events.push(event);
    // Enforce max event limit — drop oldest
    if (this._events.length > MAX_EVENTS) {
      this._events.splice(0, this._events.length - MAX_EVENTS);
    }
    this._lastActivityAt = event.timestamp;
  }

  // ----------------------------------------------------------------
  // Public API
  // ----------------------------------------------------------------

  /**
   * Add a generic TerminalEvent.
   * Prefer the typed helpers (addOutput, addInput, etc.) when possible.
   */
  addEvent(event: TerminalEvent): void {
    this._pushEvent(event);
  }

  /**
   * Record serial output arriving from the VM.
   * Also appends to the running transcript.
   */
  addOutput(data: string): void {
    const timestamp = this._now();
    this._pushEvent({ type: 'output', timestamp, data });
    this._appendTranscript(data);
  }

  /**
   * Record keyboard input sent to the VM.
   */
  addInput(data: string): void {
    const timestamp = this._now();
    this._pushEvent({ type: 'input', timestamp, data });
  }

  /**
   * Record a reconstructed shell command.
   * Also appended to the commands list (max 50, oldest dropped).
   */
  addCommand(command: string, cwd?: string): void {
    if (!command || !command.trim()) return;
    const timestamp = this._now();
    const trimmed = command.trim();

    this._pushEvent({ type: 'command', timestamp, command: trimmed, cwd });

    this._commands.push({ command: trimmed, timestamp });
    if (this._commands.length > MAX_COMMANDS) {
      this._commands.splice(0, this._commands.length - MAX_COMMANDS);
    }

    this._commandCount += 1;
  }

  /**
   * Record a system message (e.g. "VM started", "Connection lost").
   */
  addSystem(message: string): void {
    const timestamp = this._now();
    this._pushEvent({ type: 'system', timestamp, message });
  }

  // ----------------------------------------------------------------
  // Transcript management
  // ----------------------------------------------------------------

  private _appendTranscript(data: string): void {
    this._transcript += data;
    // Enforce max transcript length — drop oldest characters
    if (this._transcript.length > MAX_TRANSCRIPT_CHARS) {
      this._transcript = this._transcript.slice(
        this._transcript.length - MAX_TRANSCRIPT_CHARS
      );
    }
  }

  // ----------------------------------------------------------------
  // Queries
  // ----------------------------------------------------------------

  /**
   * Returns the last `n` commands in chronological order.
   */
  getRecentCommands(n: number): Array<{ command: string; timestamp: string }> {
    return this._commands.slice(-Math.max(0, n));
  }

  /**
   * Returns the last `maxChars` characters of the running transcript.
   */
  getRecentTranscript(maxChars: number): string {
    if (maxChars <= 0) return '';
    return this._transcript.slice(-maxChars);
  }

  /**
   * Returns a snapshot of the current buffer state.
   * The returned arrays are copies; mutations do not affect the buffer.
   */
  getState(): TerminalBufferState {
    return {
      events: [...this._events],
      commands: [...this._commands],
      transcript: this._transcript,
      sessionStartedAt: this._sessionStartedAt,
      commandCount: this._commandCount,
      hintUsageCount: this._hintUsageCount,
      lastActivityAt: this._lastActivityAt,
    };
  }

  /**
   * Reset all state and start a new session.
   */
  clear(): void {
    const now = this._now();
    this._events = [];
    this._commands = [];
    this._transcript = '';
    this._sessionStartedAt = now;
    this._commandCount = 0;
    this._hintUsageCount = 0;
    this._lastActivityAt = now;
  }

  /**
   * Monotonic count of all commands ever added in this session.
   * Not capped by MAX_COMMANDS.
   */
  getCommandCount(): number {
    return this._commandCount;
  }

  /**
   * Returns the number of hints the user has requested.
   */
  getHintUsageCount(): number {
    return this._hintUsageCount;
  }

  /**
   * Increment the hint usage counter (call when user requests a hint).
   */
  incrementHintUsage(): void {
    this._hintUsageCount += 1;
  }

  /**
   * Returns the elapsed time in seconds since the session started.
   */
  getSessionDuration(): number {
    return (
      (Date.now() - new Date(this._sessionStartedAt).getTime()) / 1000
    );
  }

  // ----------------------------------------------------------------
  // Direct transcript access (read-only)
  // ----------------------------------------------------------------

  get transcript(): string {
    return this._transcript;
  }

  get sessionStartedAt(): string {
    return this._sessionStartedAt;
  }
}
