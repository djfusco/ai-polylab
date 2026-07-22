import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  shouldTriggerAutoHint,
  detectErrorInOutput,
  detectRepeatedFailedCommand,
  AutomaticHintsController,
} from '../lib/automatic-hints';

describe('shouldTriggerAutoHint', () => {
  const base = {
    recentOutput: '',
    recentCommands: [],
    isTyping: false,
    lastHintAt: 0,
    documentHidden: false,
    config: { enabled: true, minIntervalMs: 20_000, hintLevel: 'nudge' as const },
  };

  it('returns false when disabled', () => {
    expect(shouldTriggerAutoHint({ ...base, config: { ...base.config, enabled: false } })).toBe(false);
  });

  it('returns false when typing', () => {
    expect(shouldTriggerAutoHint({ ...base, isTyping: true, recentOutput: 'command not found' })).toBe(false);
  });

  it('returns false when document hidden', () => {
    expect(shouldTriggerAutoHint({ ...base, documentHidden: true, recentOutput: 'command not found' })).toBe(false);
  });

  it('returns false when rate limited', () => {
    expect(shouldTriggerAutoHint({ ...base, lastHintAt: Date.now() - 1000, recentOutput: 'command not found' })).toBe(false);
  });

  it('triggers on error pattern', () => {
    expect(shouldTriggerAutoHint({ ...base, recentOutput: 'bash: gzip: command not found' })).toBe(true);
  });
});

describe('detectErrorInOutput', () => {
  it('detects command not found', () => {
    expect(detectErrorInOutput('bash: python: command not found')).toBeTruthy();
  });

  it('detects No such file or directory', () => {
    expect(detectErrorInOutput('xz: dispatch.tsv: No such file or directory')).toBeTruthy();
  });

  it('returns null for clean output', () => {
    expect(detectErrorInOutput('dispatch_id\ttimestamp\tregion')).toBeNull();
  });
});

describe('detectRepeatedFailedCommand', () => {
  it('detects 3+ repetitions of same command', () => {
    expect(detectRepeatedFailedCommand(['gzip dispatch.bin', 'gzip dispatch.bin', 'gzip dispatch.bin'])).toBe(true);
  });

  it('returns false for varied commands', () => {
    expect(detectRepeatedFailedCommand(['ls', 'file dispatch.bin', 'xz -d dispatch.bin'])).toBe(false);
  });
});
