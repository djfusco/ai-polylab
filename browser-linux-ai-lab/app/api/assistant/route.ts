/**
 * app/api/assistant/route.ts
 *
 * Server-side POST endpoint for the AI teaching assistant.
 *
 * Security design:
 *  - OPENAI_API_KEY is only ever accessed here (server-side); never
 *    exposed to the browser.
 *  - Request body is size-capped before parsing.
 *  - All user-supplied strings are validated; none reach the system
 *    prompt verbatim — they go into the user-role message only.
 *  - Response is parsed as JSON; if the model returns plain text it
 *    is wrapped in a { message } envelope.
 *  - Stack traces and internal errors are never forwarded to clients.
 *  - Rate limiting is in-memory (resets on cold start) — suitable
 *    for demo/prototype use; replace with Redis / KV for production.
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import type { AssistantRequest, AssistantResponse } from '@/lib/v86-types';
import { validateAssistantRequest, validateRequestSize } from '@/lib/validation';

/* ----------------------------------------------------------------
   In-memory rate limiter
   ---------------------------------------------------------------- */
const requestMap = new Map<string, number[]>();
const RATE_LIMIT_REQUESTS  = 10;   // max requests per window
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute

function checkRateLimit(ip: string): boolean {
  const now         = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const timestamps  = (requestMap.get(ip) ?? []).filter(t => t > windowStart);

  if (timestamps.length >= RATE_LIMIT_REQUESTS) return false;

  timestamps.push(now);
  requestMap.set(ip, timestamps);
  return true;
}

/* ----------------------------------------------------------------
   System instructions (developer-role, high priority)
   ---------------------------------------------------------------- */
const SYSTEM_INSTRUCTIONS = `You are a Linux teaching assistant embedded beside a
disposable browser-based Linux lab.

Analyze only the objective, commands, terminal output,
and hint history included in the request.

Do not claim to see information that was not provided.

Give the smallest useful intervention appropriate for
the selected hint level.

For nudge:
- Do not give the exact command.
- Point the learner toward the next observation or concept.

For conceptual:
- Explain the relevant Linux concept.
- Avoid completing the full task.

For command-guidance:
- Explain useful command structure, flags, or syntax.
- Avoid completing the entire task unless necessary.

For direct:
- Provide exact commands.
- Explain what each command does.

Use terminal evidence when explaining errors.
Quote or reference relevant commands and output fragments.
State uncertainty when the transcript is incomplete.

Never request passwords, private keys, API tokens, or personal information.
Do not encourage destructive commands outside the disposable lab.

When evaluating, distinguish:
- Outcome
- Process
- Error recovery
- Verification
- Efficiency
- AI assistance used

Do not present formative feedback as an authoritative academic grade.

Respond ONLY with valid JSON matching this schema:
{
  "message": "string (required, main response)",
  "observations": ["string"] (optional),
  "suggestedCommands": ["string"] (optional),
  "confidence": "low|medium|high" (optional),
  "formativeEvaluation": {
    "taskCompletion": "string",
    "strengths": ["string"],
    "missteps": ["string"],
    "recovery": ["string"],
    "verification": ["string"],
    "efficiency": ["string"],
    "nextPractice": ["string"]
  } (optional, only for evaluate mode)
}`;

/* ----------------------------------------------------------------
   Transcript sanitiser
   ---------------------------------------------------------------- */

/**
 * Strip ANSI/VT escape sequences, null bytes, and other terminal
 * control characters from raw serial output so the AI receives
 * clean plain text instead of colour codes and cursor sequences.
 */
function sanitiseTranscript(raw: string): string {
  return raw
    // ANSI escape sequences: ESC [ ... (final byte A-Za-z)
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
    // Other ESC sequences (ESC followed by a single char)
    .replace(/\x1b./g, '')
    // Null bytes
    .replace(/\x00/g, '')
    // Carriage returns (keep newlines)
    .replace(/\r/g, '')
    // Non-printable control chars except newline/tab
    // eslint-disable-next-line no-control-regex
    .replace(/[\x01-\x08\x0b-\x0c\x0e-\x1f\x7f]/g, '')
    // Collapse runs of blank lines to at most two
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* ----------------------------------------------------------------
   User message builder
   ---------------------------------------------------------------- */

/**
 * Builds a structured, clearly-labelled user message from an
 * AssistantRequest.  All sensitive content is limited to the
 * user-role message; none appears in the system prompt.
 */
function buildUserMessage(request: AssistantRequest): string {
  const lines: string[] = [];

  // --- Header ---------------------------------------------------
  lines.push(`MODE: ${request.mode.toUpperCase()}`);
  lines.push(`HINT LEVEL: ${request.hintLevel}`);

  // --- Lab objective --------------------------------------------
  if (request.objective) {
    lines.push('');
    lines.push('=== LAB OBJECTIVE ===');
    lines.push(request.objective);
  }

  // --- User question (for question / hint modes) ---------------
  if (request.question) {
    lines.push('');
    lines.push('=== USER QUESTION ===');
    // Trim to a reasonable length to prevent prompt injection via question
    lines.push(request.question.slice(0, 1_000));
  }

  // --- Commands entered ----------------------------------------
  lines.push('');
  lines.push(
    `=== COMMANDS ENTERED (${request.recentCommands.length} recorded) ===`,
  );
  if (request.recentCommands.length === 0) {
    lines.push('No commands have been entered yet.');
  } else {
    for (const cmd of request.recentCommands) {
      lines.push(`[${cmd.timestamp}] $ ${cmd.command}`);
    }
  }

  // --- Terminal transcript -------------------------------------
  lines.push('');
  lines.push('=== TERMINAL TRANSCRIPT (recent) ===');
  if (!request.recentTranscript || request.recentTranscript.trim() === '') {
    lines.push('No terminal output recorded yet.');
  } else {
    // Strip ANSI codes / control chars, then hard-cap length
    const transcript = sanitiseTranscript(
      request.recentTranscript.slice(-12_000)
    );
    lines.push(transcript);
  }

  // --- Hint history --------------------------------------------
  if (request.hintUsage && request.hintUsage.length > 0) {
    lines.push('');
    lines.push(
      `=== HINT HISTORY (${request.hintUsage.length} hints requested) ===`,
    );
    for (const hint of request.hintUsage) {
      lines.push(`[${hint.timestamp}] level=${hint.level}`);
    }
  }

  return lines.join('\n');
}

/* ----------------------------------------------------------------
   POST /api/assistant
   ---------------------------------------------------------------- */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    /* 1 ── Size cap ─────────────────────────────────────────────── */
    const bodyText = await req.text();
    validateRequestSize(bodyText); // throws if too large

    /* 2 ── Parse + validate ─────────────────────────────────────── */
    let rawBody: unknown;
    try {
      rawBody = JSON.parse(bodyText);
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON in request body.' },
        { status: 400 },
      );
    }

    const request: AssistantRequest = validateAssistantRequest(rawBody);

    /* 3 ── Rate limiting ─────────────────────────────────────────── */
    // Prefer X-Forwarded-For (set by proxies/load balancers) then
    // fall back to the connection remote address if available.
    const clientIP =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      req.headers.get('x-real-ip') ??
      'unknown';

    if (!checkRateLimit(clientIP)) {
      return NextResponse.json(
        {
          error:
            'Rate limit exceeded. You may send up to 10 requests per minute. ' +
            'Please wait a moment before trying again.',
        },
        { status: 429 },
      );
    }

    /* 4 ── API key check ─────────────────────────────────────────── */
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error('[assistant] OPENAI_API_KEY environment variable is not set.');
      return NextResponse.json(
        {
          error:
            'The AI assistant is not configured. ' +
            'Please set the OPENAI_API_KEY environment variable.',
        },
        { status: 503 },
      );
    }

    /* 5 ── Build user message ────────────────────────────────────── */
    const userMessage = buildUserMessage(request);

    /* 6 ── Call OpenAI Responses API ─────────────────────────────── */
    const client = new OpenAI({ apiKey });
    const model  = process.env.OPENAI_MODEL ?? 'gpt-4.1-mini';

    const aiResponse = await client.responses.create({
      model,
      instructions: SYSTEM_INSTRUCTIONS,
      input: [{ role: 'user', content: userMessage }],
    });

    /* 7 ── Parse response ────────────────────────────────────────── */
    const rawText = aiResponse.output_text ?? '';

    let parsed: AssistantResponse;
    try {
      parsed = JSON.parse(rawText) as AssistantResponse;
    } catch {
      // Model did not return valid JSON — wrap the raw text so the
      // client always receives a consistent envelope.
      parsed = { message: rawText };
    }

    /* 8 ── Sanitise ─────────────────────────────────────────────── */
    // Ensure message is a non-empty string (we render with textContent,
    // not innerHTML, but a defensive coercion costs nothing).
    if (typeof parsed.message !== 'string') {
      parsed.message = String(parsed.message ?? '');
    }
    if (!parsed.message) {
      parsed.message =
        'The assistant did not provide a response. Please try again.';
    }

    // Ensure optional array fields are actually arrays if present
    if (parsed.observations !== undefined && !Array.isArray(parsed.observations)) {
      delete parsed.observations;
    }
    if (
      parsed.suggestedCommands !== undefined &&
      !Array.isArray(parsed.suggestedCommands)
    ) {
      delete parsed.suggestedCommands;
    }
    if (
      parsed.confidence !== undefined &&
      !['low', 'medium', 'high'].includes(String(parsed.confidence))
    ) {
      delete parsed.confidence;
    }

    return NextResponse.json(parsed);

  } catch (err: unknown) {
    // Do NOT leak stack traces, file paths, or API keys.
    const message =
      err instanceof Error ? err.message : 'An internal error occurred.';

    // Use 400 for validation errors, 500 for everything else.
    const isValidationError =
      message.toLowerCase().includes('validation') ||
      message.toLowerCase().includes('invalid') ||
      message.toLowerCase().includes('required');

    const status = isValidationError ? 400 : 500;

    if (status === 500) {
      // Log full error server-side only
      console.error('[assistant] Unhandled error:', err);
    }

    return NextResponse.json({ error: message }, { status });
  }
}
