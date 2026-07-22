// ============================================================
// transcript.ts — utilities for building and exporting session
// transcripts as JSON or plain text.
// ============================================================

import type {
  TerminalBufferState,
  AssistantInteraction,
  TranscriptExport,
  TerminalEvent,
} from './v86-types';

// ------------------------------------------------------------------
// buildTranscriptExport
// ------------------------------------------------------------------

/**
 * Constructs a `TranscriptExport` from the current buffer state,
 * assistant interactions, and the lab objective string.
 */
export function buildTranscriptExport(params: {
  buffer: TerminalBufferState;
  interactions: AssistantInteraction[];
  objective: string;
}): TranscriptExport {
  const { buffer, interactions, objective } = params;

  return {
    sessionStartedAt: buffer.sessionStartedAt,
    sessionEndedAt: new Date().toISOString(),
    objective,
    commands: buffer.commands.map((c) => ({
      command: c.command,
      timestamp: c.timestamp,
    })),
    events: buffer.events,
    assistantInteractions: interactions,
  };
}

// ------------------------------------------------------------------
// buildPlainTextTranscript
// ------------------------------------------------------------------

/**
 * Renders a `TranscriptExport` as a human-readable plain-text string.
 * Suitable for clipboard copy or `.txt` download.
 */
export function buildPlainTextTranscript(state: TranscriptExport): string {
  const lines: string[] = [];

  const separator = '='.repeat(60);
  const thin = '-'.repeat(60);

  lines.push(separator);
  lines.push('Browser Linux AI Lab — Session Transcript');
  lines.push(separator);
  lines.push('');
  lines.push(`Session started : ${formatTimestamp(state.sessionStartedAt)}`);
  lines.push(`Session ended   : ${formatTimestamp(state.sessionEndedAt)}`);
  lines.push('');
  lines.push('Objective:');
  lines.push(state.objective);
  lines.push('');

  // ---- Commands ----
  if (state.commands.length > 0) {
    lines.push(separator);
    lines.push('Commands Entered');
    lines.push(separator);
    state.commands.forEach((cmd, idx) => {
      lines.push(`  ${String(idx + 1).padStart(3)}. [${formatTimestamp(cmd.timestamp)}] $ ${cmd.command}`);
    });
    lines.push('');
  }

  // ---- Terminal output (filtered from events) ----
  const outputEvents = state.events.filter(
    (e): e is Extract<TerminalEvent, { type: 'output' }> => e.type === 'output'
  );
  if (outputEvents.length > 0) {
    lines.push(separator);
    lines.push('Terminal Output');
    lines.push(separator);
    // Concatenate all output chunks into one block
    const raw = outputEvents.map((e) => e.data).join('');
    lines.push(raw);
    lines.push('');
  }

  // ---- System events ----
  const systemEvents = state.events.filter(
    (e): e is Extract<TerminalEvent, { type: 'system' }> => e.type === 'system'
  );
  if (systemEvents.length > 0) {
    lines.push(separator);
    lines.push('System Events');
    lines.push(separator);
    systemEvents.forEach((e) => {
      lines.push(`  [${formatTimestamp(e.timestamp)}] ${e.message}`);
    });
    lines.push('');
  }

  // ---- Assistant interactions ----
  if (state.assistantInteractions.length > 0) {
    lines.push(separator);
    lines.push('AI Assistant Interactions');
    lines.push(separator);

    state.assistantInteractions.forEach((interaction, idx) => {
      lines.push('');
      lines.push(
        `Interaction ${idx + 1} — ${formatTimestamp(interaction.timestamp)}`
      );
      lines.push(thin);
      lines.push(`  Mode       : ${interaction.mode}`);
      lines.push(`  Hint level : ${interaction.hintLevel}`);
      if (interaction.question) {
        lines.push(`  Question   : ${interaction.question}`);
      }
      lines.push('');
      lines.push('  Response:');
      lines.push(indent(interaction.response.message, 4));

      if (
        interaction.response.observations &&
        interaction.response.observations.length > 0
      ) {
        lines.push('');
        lines.push('  Observations:');
        interaction.response.observations.forEach((o) => {
          lines.push(`    • ${o}`);
        });
      }

      if (
        interaction.response.suggestedCommands &&
        interaction.response.suggestedCommands.length > 0
      ) {
        lines.push('');
        lines.push('  Suggested commands:');
        interaction.response.suggestedCommands.forEach((c) => {
          lines.push(`    $ ${c}`);
        });
      }

      if (interaction.response.formativeEvaluation) {
        const fe = interaction.response.formativeEvaluation;
        lines.push('');
        lines.push('  Formative Evaluation:');
        if (fe.taskCompletion) {
          lines.push(`    Task completion : ${fe.taskCompletion}`);
        }
        printList(lines, 'Strengths', fe.strengths);
        printList(lines, 'Missteps', fe.missteps);
        printList(lines, 'Recovery', fe.recovery);
        printList(lines, 'Verification', fe.verification);
        printList(lines, 'Efficiency', fe.efficiency);
        printList(lines, 'Next practice', fe.nextPractice);
      }
    });

    lines.push('');
  }

  lines.push(separator);
  lines.push('End of transcript');
  lines.push(separator);

  return lines.join('\n');
}

// ------------------------------------------------------------------
// downloadTranscriptAsJSON
// ------------------------------------------------------------------

/**
 * Creates a JSON Blob from the transcript and triggers a browser
 * `<a>` click download.  Browser-only.
 */
export function downloadTranscriptAsJSON(transcript: TranscriptExport): void {
  const json = JSON.stringify(transcript, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const filename = buildFilename(transcript.sessionStartedAt, 'json');

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();

  // Clean up after a short delay
  setTimeout(() => {
    URL.revokeObjectURL(url);
    anchor.remove();
  }, 1000);
}

// ------------------------------------------------------------------
// copyTranscriptAsText
// ------------------------------------------------------------------

/**
 * Renders the transcript as plain text and copies it to the system
 * clipboard.  Browser-only.
 */
export async function copyTranscriptAsText(
  state: TranscriptExport
): Promise<void> {
  const text = buildPlainTextTranscript(state);
  await navigator.clipboard.writeText(text);
}

// ------------------------------------------------------------------
// Internal helpers
// ------------------------------------------------------------------

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function indent(text: string, spaces: number): string {
  const pad = ' '.repeat(spaces);
  return text
    .split('\n')
    .map((line) => pad + line)
    .join('\n');
}

function printList(
  lines: string[],
  label: string,
  items: string[] | undefined
): void {
  if (!items || items.length === 0) return;
  lines.push(`    ${label}:`);
  items.forEach((item) => lines.push(`      • ${item}`));
}

function buildFilename(sessionStartedAt: string, ext: string): string {
  const date = new Date(sessionStartedAt);
  const pad = (n: number): string => String(n).padStart(2, '0');
  const tag = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(
    date.getDate()
  )}-${pad(date.getHours())}${pad(date.getMinutes())}`;
  return `lab-transcript-${tag}.${ext}`;
}
