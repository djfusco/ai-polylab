import { describe, it, expect } from 'vitest';
import { analyzeEvidence } from '../lib/evidence-analyzer';

describe('analyzeEvidence', () => {
  it('detects file command usage', () => {
    const evidence = analyzeEvidence({
      commands: [{ command: 'file dispatch.bin', timestamp: '2024-01-01T00:00:00Z' }],
      recentOutput: 'dispatch.bin: XZ compressed data',
    });
    expect(evidence.compressionIdentified.detected).toBe(true);
  });

  it('detects XZ decompression attempt', () => {
    const evidence = analyzeEvidence({
      commands: [{ command: 'xz -d dispatch.bin', timestamp: '2024-01-01T00:00:00Z' }],
      recentOutput: '',
    });
    expect(evidence.xzDecompressionAttempted.detected).toBe(true);
  });

  it('detects head command for output inspection', () => {
    const evidence = analyzeEvidence({
      commands: [{ command: 'head dispatch.tsv', timestamp: '2024-01-01T00:00:00Z' }],
      recentOutput: '',
    });
    expect(evidence.outputInspected.detected).toBe(true);
  });

  it('detects wc -l for row counting', () => {
    const evidence = analyzeEvidence({
      commands: [{ command: 'wc -l dispatch.tsv', timestamp: '2024-01-01T00:00:00Z' }],
      recentOutput: '26 dispatch.tsv',
    });
    expect(evidence.rowCountDetermined.detected).toBe(true);
  });

  it('returns no detections for empty commands', () => {
    const evidence = analyzeEvidence({ commands: [], recentOutput: '' });
    expect(evidence.compressionIdentified.detected).toBe(false);
    expect(evidence.xzDecompressionAttempted.detected).toBe(false);
  });
});
