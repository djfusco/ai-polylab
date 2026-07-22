import type { HintLevel } from './v86-types';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface AutoHintConfig {
  enabled: boolean;
  /** Minimum ms between auto-hint triggers. Default: 20 000 ms */
  minIntervalMs: number;
  hintLevel: HintLevel;
}

export const DEFAULT_AUTO_HINT_CONFIG: AutoHintConfig = {
  enabled: false,
  minIntervalMs: 20_000,
  hintLevel: 'nudge',
};

// ---------------------------------------------------------------------------
// Error patterns — phrases that indicate the user may be stuck
// ---------------------------------------------------------------------------

const ERROR_PATTERNS: string[] = [
  'command not found',
  'No such file or directory',
  'Permission denied',
  'unknown suffix',
  'not in gzip format',
  'File format not recognized',
  'cannot open',
  'unrecognized file type',
];

// ---------------------------------------------------------------------------
// Progress indicators — if ANY of these appear the user is making progress
// ---------------------------------------------------------------------------

const PROGRESS_INDICATORS: string[] = [
  '.tsv',
  'dispatch.tsv',
  'tab-separated',
  'xz:',
  'unxz',
  'xzcat',
  'decompressing',
  '\\t',          // literal tab escape in file output
  'file dispatch',
  'wc -l',
];

// ---------------------------------------------------------------------------
// Pure utility functions
// ---------------------------------------------------------------------------

/**
 * Returns the first matched error phrase found in `output`, or `null` if none.
 */
export function detectErrorInOutput(output: string): string | null {
  for (const pattern of ERROR_PATTERNS) {
    if (output.includes(pattern)) {
      return pattern;
    }
  }
  return null;
}

/**
 * Returns `true` when the same non-empty command string appears 3 or more
 * times within the last 5 entries of `commands`.
 */
export function detectRepeatedFailedCommand(commands: string[]): boolean {
  const recent = commands.slice(-5);
  const counts = new Map<string, number>();
  for (const cmd of recent) {
    const trimmed = cmd.trim();
    if (!trimmed) continue;
    counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1);
    if ((counts.get(trimmed) ?? 0) >= 3) return true;
  }
  return false;
}

/**
 * Returns `true` when 5 or more commands have been issued without any of the
 * known progress indicators appearing in `recentOutput`.
 */
export function detectStuckProgress(params: {
  recentOutput: string;
  commandsSinceLastSuccess: number;
}): boolean {
  if (params.commandsSinceLastSuccess < 5) return false;
  const lower = params.recentOutput.toLowerCase();
  return !PROGRESS_INDICATORS.some((indicator) =>
    lower.includes(indicator.toLowerCase()),
  );
}

/**
 * Core decision function.  Returns `true` when all gating conditions pass AND
 * at least one trigger condition is met.
 */
export function shouldTriggerAutoHint(params: {
  recentOutput: string;
  recentCommands: string[];
  isTyping: boolean;
  lastHintAt: number;
  documentHidden: boolean;
  config: AutoHintConfig;
}): boolean {
  const { recentOutput, recentCommands, isTyping, lastHintAt, documentHidden, config } =
    params;

  // --- Gating conditions (all must pass) ---
  if (!config.enabled) return false;
  if (isTyping) return false;
  if (documentHidden) return false;
  if (Date.now() - lastHintAt < config.minIntervalMs) return false;

  // --- Trigger conditions (any one is sufficient) ---

  // 1. Error phrase detected in recent output
  if (detectErrorInOutput(recentOutput) !== null) return true;

  // 2. Same command repeated 3+ times in the last 5
  if (detectRepeatedFailedCommand(recentCommands)) return true;

  // 3. Several commands with no visible progress
  if (
    detectStuckProgress({
      recentOutput,
      commandsSinceLastSuccess: recentCommands.length,
    })
  ) {
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// AutomaticHintsController
// ---------------------------------------------------------------------------

/** Typing inactivity timeout — user is considered "not typing" after 3 s */
const TYPING_IDLE_MS = 3_000;

export class AutomaticHintsController {
  private config: AutoHintConfig;
  private lastHintAt = 0;
  private typingTimer: ReturnType<typeof setTimeout> | null = null;
  private _isTyping = false;

  constructor(config?: Partial<AutoHintConfig>) {
    this.config = { ...DEFAULT_AUTO_HINT_CONFIG, ...config };
  }

  // -------------------------------------------------------------------------
  // Configuration helpers
  // -------------------------------------------------------------------------

  setEnabled(enabled: boolean): void {
    this.config = { ...this.config, enabled };
  }

  setConfig(config: Partial<AutoHintConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): AutoHintConfig {
    return { ...this.config };
  }

  // -------------------------------------------------------------------------
  // Typing state
  // -------------------------------------------------------------------------

  /**
   * Call whenever the user presses a key.  Marks the user as typing and
   * schedules an automatic reset after {@link TYPING_IDLE_MS} ms.
   */
  onUserTyping(): void {
    this._isTyping = true;
    if (this.typingTimer !== null) {
      clearTimeout(this.typingTimer);
    }
    this.typingTimer = setTimeout(() => {
      this._isTyping = false;
      this.typingTimer = null;
    }, TYPING_IDLE_MS);
  }

  isTyping(): boolean {
    return this._isTyping;
  }

  // -------------------------------------------------------------------------
  // Output inspection
  // -------------------------------------------------------------------------

  /**
   * Evaluates whether an automatic hint should fire given the current state.
   * If so, records the hint timestamp and invokes `onShouldHint` with a short
   * human-readable reason string.
   */
  checkOutput(params: {
    recentOutput: string;
    recentCommands: string[];
    documentHidden: boolean;
    onShouldHint: (reason: string) => void;
  }): void {
    const { recentOutput, recentCommands, documentHidden, onShouldHint } = params;

    const triggered = shouldTriggerAutoHint({
      recentOutput,
      recentCommands,
      isTyping: this._isTyping,
      lastHintAt: this.lastHintAt,
      documentHidden,
      config: this.config,
    });

    if (!triggered) return;

    this.markHintSent();

    // Build a concise reason string for the caller
    const errorMatch = detectErrorInOutput(recentOutput);
    let reason: string;
    if (errorMatch) {
      reason = `Error detected: "${errorMatch}"`;
    } else if (detectRepeatedFailedCommand(recentCommands)) {
      reason = 'Repeated command detected';
    } else {
      reason = 'No visible progress after several commands';
    }

    onShouldHint(reason);
  }

  // -------------------------------------------------------------------------
  // Hint timestamp management
  // -------------------------------------------------------------------------

  markHintSent(): void {
    this.lastHintAt = Date.now();
  }

  getLastHintAt(): number {
    return this.lastHintAt;
  }
}
