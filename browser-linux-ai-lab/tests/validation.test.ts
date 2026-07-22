import { describe, it, expect } from 'vitest';
import { validateAssistantRequest, validateRequestSize } from '../lib/validation';

describe('validateAssistantRequest', () => {
  const validRequest = {
    mode: 'hint',
    hintLevel: 'nudge',
    recentCommands: [{ command: 'ls', timestamp: '2024-01-01T00:00:00Z' }],
    recentTranscript: 'some output',
  };

  it('accepts valid request', () => {
    expect(() => validateAssistantRequest(validRequest)).not.toThrow();
  });

  it('rejects invalid mode', () => {
    expect(() => validateAssistantRequest({ ...validRequest, mode: 'invalid' })).toThrow();
  });

  it('rejects invalid hintLevel', () => {
    expect(() => validateAssistantRequest({ ...validRequest, hintLevel: 'none' })).toThrow();
  });

  it('truncates transcript to 12000 chars', () => {
    const req = validateAssistantRequest({
      ...validRequest,
      recentTranscript: 'x'.repeat(20000),
    });
    expect(req.recentTranscript.length).toBeLessThanOrEqual(12000);
  });

  it('truncates commands to 20', () => {
    const cmds = Array.from({ length: 30 }, (_, i) => ({ command: `cmd${i}`, timestamp: '2024-01-01T00:00:00Z' }));
    const req = validateAssistantRequest({ ...validRequest, recentCommands: cmds });
    expect(req.recentCommands.length).toBeLessThanOrEqual(20);
  });

  it('rejects non-object input', () => {
    expect(() => validateAssistantRequest(null)).toThrow();
    expect(() => validateAssistantRequest('string')).toThrow();
  });
});

describe('validateRequestSize', () => {
  it('accepts small requests', () => {
    expect(() => validateRequestSize('x'.repeat(1000))).not.toThrow();
  });

  it('rejects oversized requests', () => {
    expect(() => validateRequestSize('x'.repeat(60_000))).toThrow();
  });
});
