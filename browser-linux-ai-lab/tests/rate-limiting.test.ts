import { describe, it, expect } from 'vitest';
import { validateRequestSize } from '../lib/validation';

describe('Rate limiting helpers', () => {
  it('validateRequestSize allows 40k bytes', () => {
    expect(() => validateRequestSize('x'.repeat(40_000))).not.toThrow();
  });

  it('validateRequestSize rejects 51k bytes', () => {
    expect(() => validateRequestSize('x'.repeat(51_000))).toThrow();
  });
});
