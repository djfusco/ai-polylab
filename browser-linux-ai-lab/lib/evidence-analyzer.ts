import type { EvidenceObservation } from './v86-types';

// ---------------------------------------------------------------------------
// Lab evidence shape
// ---------------------------------------------------------------------------

export interface LabEvidence {
  compressionIdentified: EvidenceObservation;
  xzDecompressionAttempted: EvidenceObservation;
  outputInspected: EvidenceObservation;
  rowCountDetermined: EvidenceObservation;
  resultVerified: EvidenceObservation;
  fileSeparatorChecked: EvidenceObservation;
}

// ---------------------------------------------------------------------------
// Regex helpers
// ---------------------------------------------------------------------------

/** Matches `file dispatch.bin` or `file ./dispatch.bin`, etc. */
const RE_FILE_DISPATCH_BIN = /\bfile\s+\.?\/?(root\/lab\/)?dispatch\.bin\b/;

/** Matches any of the common xz decompression commands */
const RE_XZ_DECOMPRESS =
  /\b(xz\s+(-[a-zA-Z]*d[a-zA-Z]*|--decompress)[^\n]*|unxz\b|xzcat\b)/;

/** Matches `head` or `cat dispatch.tsv` / `less dispatch.tsv` */
const RE_HEAD_OR_CAT_TSV =
  /\b(head(\s+-\S+)?\s+.*dispatch\.tsv|cat\s+.*dispatch\.tsv|less\s+.*dispatch\.tsv|more\s+.*dispatch\.tsv)\b/;

/** Also match a plain `head` with no arguments (shows first lines of last file) */
const RE_HEAD_PLAIN = /^\s*head\b/m;

/** `wc -l` anywhere */
const RE_WC_L = /\bwc\s+-[a-zA-Z]*l[a-zA-Z]*\b/;

/** A bare number on its own line, e.g. "  1234" — typical wc -l output */
const RE_WC_OUTPUT = /^\s*\d+(\s+\S+)?\s*$/m;

/** `file dispatch.tsv`, `cat -A dispatch.tsv`, `head -c <n> dispatch.tsv` */
const RE_FILE_TSV = /\bfile\s+.*dispatch\.tsv\b/;
const RE_CAT_A_TSV = /\bcat\s+-[a-zA-Z]*A[a-zA-Z]*\s+.*dispatch\.tsv\b/;
const RE_HEAD_C_TSV = /\bhead\s+-c\s+\d+\s+.*dispatch\.tsv\b/;
const RE_HEXDUMP_TSV = /\b(hexdump|xxd|od)\s+.*dispatch\.tsv\b/;

/** References to tabs or TSV in output */
const RE_TAB_IN_OUTPUT = /(\bTSV\b|tab[- ]separated|\\\\t|\t)/i;

/** `cut -f` — implies understanding of tab-delimited fields */
const RE_CUT_F = /\bcut\s+-[a-zA-Z]*f\b/;

/** `awk -F` with a tab character or literal $'\t' */
const RE_AWK_TAB = /\bawk\s+(-F\s*'?\\t'?|-F\s*"\s*\\t\s*")/;

// ---------------------------------------------------------------------------
// Core analysis function
// ---------------------------------------------------------------------------

/**
 * Analyses the supplied command history and recent terminal output and returns
 * a structured {@link LabEvidence} object indicating which lab tasks have been
 * attempted or completed.
 */
export function analyzeEvidence(params: {
  commands: Array<{ command: string; timestamp: string }>;
  recentOutput: string;
}): LabEvidence {
  const { commands, recentOutput } = params;

  // Build a single string of all commands for bulk matching
  const allCommands = commands.map((c) => c.command).join('\n');

  // ── 1. compressionIdentified ──────────────────────────────────────────────
  // User ran `file dispatch.bin` to determine the compression format.
  const compressionIdentifiedDetected = RE_FILE_DISPATCH_BIN.test(allCommands);
  const compressionIdentifiedEvidence = compressionIdentifiedDetected
    ? extractMatch(allCommands, RE_FILE_DISPATCH_BIN)
    : undefined;

  // ── 2. xzDecompressionAttempted ───────────────────────────────────────────
  const xzDetected = RE_XZ_DECOMPRESS.test(allCommands);
  const xzEvidence = xzDetected
    ? extractMatch(allCommands, RE_XZ_DECOMPRESS)
    : undefined;

  // ── 3. outputInspected ────────────────────────────────────────────────────
  // User used head / cat to look at the extracted TSV.
  const outputInspectedDetected =
    RE_HEAD_OR_CAT_TSV.test(allCommands) || RE_HEAD_PLAIN.test(allCommands);
  const outputInspectedEvidence = outputInspectedDetected
    ? (extractMatch(allCommands, RE_HEAD_OR_CAT_TSV) ??
       extractMatch(allCommands, RE_HEAD_PLAIN))
    : undefined;

  // ── 4. rowCountDetermined ─────────────────────────────────────────────────
  // Either a `wc -l` command was issued, OR a bare number appeared as output.
  const wcCommandDetected = RE_WC_L.test(allCommands);
  const wcOutputDetected = RE_WC_OUTPUT.test(recentOutput);
  const rowCountDetermined = wcCommandDetected || wcOutputDetected;
  const rowCountEvidence = wcCommandDetected
    ? extractMatch(allCommands, RE_WC_L)
    : wcOutputDetected
      ? extractMatch(recentOutput, RE_WC_OUTPUT) ?? 'numeric output detected'
      : undefined;

  // ── 5. resultVerified ─────────────────────────────────────────────────────
  // User verified the extracted file via file, cat -A, head -c, hexdump, etc.
  const resultVerifiedDetected =
    RE_FILE_TSV.test(allCommands) ||
    RE_CAT_A_TSV.test(allCommands) ||
    RE_HEAD_C_TSV.test(allCommands) ||
    RE_HEXDUMP_TSV.test(allCommands);
  const resultVerifiedEvidence = resultVerifiedDetected
    ? (extractMatch(allCommands, RE_FILE_TSV) ??
       extractMatch(allCommands, RE_CAT_A_TSV) ??
       extractMatch(allCommands, RE_HEAD_C_TSV) ??
       extractMatch(allCommands, RE_HEXDUMP_TSV))
    : undefined;

  // ── 6. fileSeparatorChecked ───────────────────────────────────────────────
  // User confirmed that the file is tab-separated via cut -f, awk with tab
  // separator, or TSV/tab references visible in the terminal output.
  const separatorByCommand = RE_CUT_F.test(allCommands) || RE_AWK_TAB.test(allCommands);
  const separatorByOutput = RE_TAB_IN_OUTPUT.test(recentOutput);
  const fileSeparatorChecked = separatorByCommand || separatorByOutput;
  const separatorEvidence = separatorByCommand
    ? (extractMatch(allCommands, RE_CUT_F) ?? extractMatch(allCommands, RE_AWK_TAB))
    : separatorByOutput
      ? 'Tab-separator reference in terminal output'
      : undefined;

  return {
    compressionIdentified: {
      label: 'Compression format identified',
      detected: compressionIdentifiedDetected,
      evidence: compressionIdentifiedEvidence,
    },
    xzDecompressionAttempted: {
      label: 'XZ decompression attempted',
      detected: xzDetected,
      evidence: xzEvidence,
    },
    outputInspected: {
      label: 'Extracted file output inspected',
      detected: outputInspectedDetected,
      evidence: outputInspectedEvidence,
    },
    rowCountDetermined: {
      label: 'Row count determined',
      detected: rowCountDetermined,
      evidence: rowCountEvidence,
    },
    resultVerified: {
      label: 'Extracted file verified',
      detected: resultVerifiedDetected,
      evidence: resultVerifiedEvidence,
    },
    fileSeparatorChecked: {
      label: 'Tab-separated format confirmed',
      detected: fileSeparatorChecked,
      evidence: separatorEvidence,
    },
  };
}

// ---------------------------------------------------------------------------
// Summary helpers
// ---------------------------------------------------------------------------

/**
 * Returns an array of human-readable strings describing which evidence items
 * have been detected.
 */
export function getEvidenceSummary(evidence: LabEvidence): string[] {
  const summary: string[] = [];

  if (evidence.compressionIdentified.detected) {
    summary.push('Compression identification attempted');
  }
  if (evidence.xzDecompressionAttempted.detected) {
    summary.push('XZ decompression attempted');
  }
  if (evidence.outputInspected.detected) {
    summary.push('Extracted file output inspected');
  }
  if (evidence.rowCountDetermined.detected) {
    summary.push('Row count determined');
  }
  if (evidence.resultVerified.detected) {
    summary.push('Extracted file verified');
  }
  if (evidence.fileSeparatorChecked.detected) {
    summary.push('Tab-separated format confirmed');
  }

  return summary;
}

/**
 * Returns a compact string suitable for inclusion in an AI prompt that
 * summarises the evidence collected so far.
 *
 * Example output:
 * ```
 * Evidence observed:
 * [✓] Compression format identified  (evidence: "file dispatch.bin")
 * [✗] XZ decompression attempted
 * [✓] Extracted file output inspected  (evidence: "head dispatch.tsv")
 * ...
 * ```
 */
export function getEvidenceForAI(evidence: LabEvidence): string {
  const lines: string[] = ['Evidence observed:'];

  const entries = Object.values(evidence) as EvidenceObservation[];
  for (const obs of entries) {
    const tick = obs.detected ? '[✓]' : '[✗]';
    const evPart = obs.detected && obs.evidence ? `  (evidence: "${obs.evidence}")` : '';
    lines.push(`${tick} ${obs.label}${evPart}`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extracts the first matching substring from `text` for the given `regex`.
 * Returns `undefined` when there is no match.
 */
function extractMatch(text: string, regex: RegExp): string | undefined {
  const match = regex.exec(text);
  return match ? match[0].trim() : undefined;
}
