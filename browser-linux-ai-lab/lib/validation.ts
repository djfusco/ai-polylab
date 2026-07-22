// ============================================================
// validation.ts — request validation for the AI assistant API.
//
// All functions are safe to use in both server (API route) and
// browser contexts — they have no runtime dependencies on Node
// or browser APIs.
// ============================================================

import type { AssistantRequest, AssistantMode, HintLevel } from './v86-types';

// ------------------------------------------------------------------
// Limits
// ------------------------------------------------------------------

export const MAX_TRANSCRIPT_CHARS = 12_000;
export const MAX_COMMANDS = 20;
export const MAX_QUESTION_CHARS = 2_000;
export const MAX_HINT_HISTORY = 5;
export const MAX_REQUEST_SIZE_BYTES = 50_000;

// ------------------------------------------------------------------
// Valid enum values
// ------------------------------------------------------------------

const VALID_MODES: AssistantMode[] = [
  'question',
  'hint',
  'explain-error',
  'evaluate',
];

const VALID_HINT_LEVELS: HintLevel[] = [
  'nudge',
  'conceptual',
  'command-guidance',
  'direct',
];

// ------------------------------------------------------------------
// ValidationError type
// ------------------------------------------------------------------

export type ValidationError = { field: string; message: string };

export function formatValidationError(err: ValidationError): object {
  return {
    error: 'Validation failed',
    field: err.field,
    message: err.message,
  };
}

// ------------------------------------------------------------------
// validateRequestSize
// ------------------------------------------------------------------

/**
 * Throws a `ValidationError`-shaped Error if the raw request body
 * string exceeds `MAX_REQUEST_SIZE_BYTES`.
 *
 * Call this before JSON.parse() in API routes.
 */
export function validateRequestSize(body: string): void {
  // Use TextEncoder when available (browser + Node 18+), fall back to
  // a byte-length estimate for older environments.
  let byteLength: number;
  if (typeof TextEncoder !== 'undefined') {
    byteLength = new TextEncoder().encode(body).byteLength;
  } else {
    // Conservative estimate: assume UTF-16 worst case (2 bytes/char)
    byteLength = body.length * 2;
  }

  if (byteLength > MAX_REQUEST_SIZE_BYTES) {
    throw Object.assign(
      new Error(
        `Request body too large: ${byteLength} bytes (max ${MAX_REQUEST_SIZE_BYTES})`
      ),
      { field: 'body', code: 'REQUEST_TOO_LARGE' }
    );
  }
}

// ------------------------------------------------------------------
// validateAssistantRequest
// ------------------------------------------------------------------

/**
 * Validates and sanitises an `AssistantRequest` payload.
 *
 * - Throws a descriptive `Error` if any required field is missing or
 *   has an invalid type/value.
 * - Trims long strings and arrays to their enforced maximums.
 * - Returns the sanitised `AssistantRequest`.
 */
export function validateAssistantRequest(body: unknown): AssistantRequest {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw fieldError('body', 'Request body must be a JSON object');
  }

  const raw = body as Record<string, unknown>;

  // ---- mode ----
  const mode = raw['mode'];
  if (typeof mode !== 'string') {
    throw fieldError('mode', 'mode must be a string');
  }
  if (!VALID_MODES.includes(mode as AssistantMode)) {
    throw fieldError(
      'mode',
      `mode must be one of: ${VALID_MODES.join(', ')}. Received: "${mode}"`
    );
  }

  // ---- hintLevel ----
  const hintLevel = raw['hintLevel'];
  if (typeof hintLevel !== 'string') {
    throw fieldError('hintLevel', 'hintLevel must be a string');
  }
  if (!VALID_HINT_LEVELS.includes(hintLevel as HintLevel)) {
    throw fieldError(
      'hintLevel',
      `hintLevel must be one of: ${VALID_HINT_LEVELS.join(', ')}. Received: "${hintLevel}"`
    );
  }

  // ---- recentTranscript ----
  const rawTranscript = raw['recentTranscript'];
  if (typeof rawTranscript !== 'string') {
    throw fieldError('recentTranscript', 'recentTranscript must be a string');
  }
  const recentTranscript =
    rawTranscript.length > MAX_TRANSCRIPT_CHARS
      ? rawTranscript.slice(-MAX_TRANSCRIPT_CHARS)
      : rawTranscript;

  // ---- recentCommands ----
  const rawCommands = raw['recentCommands'];
  if (!Array.isArray(rawCommands)) {
    throw fieldError('recentCommands', 'recentCommands must be an array');
  }
  const validatedCommands = rawCommands
    .map((item, idx) => {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) {
        throw fieldError(
          `recentCommands[${idx}]`,
          'Each command entry must be an object'
        );
      }
      const entry = item as Record<string, unknown>;
      if (typeof entry['command'] !== 'string') {
        throw fieldError(
          `recentCommands[${idx}].command`,
          'command must be a string'
        );
      }
      if (typeof entry['timestamp'] !== 'string') {
        throw fieldError(
          `recentCommands[${idx}].timestamp`,
          'timestamp must be a string'
        );
      }
      return {
        command: (entry['command'] as string).slice(0, 1_000),
        timestamp: entry['timestamp'] as string,
      };
    })
    .slice(-MAX_COMMANDS); // Keep only the most recent N

  // ---- question (optional) ----
  let question: string | undefined;
  if (raw['question'] !== undefined) {
    if (typeof raw['question'] !== 'string') {
      throw fieldError('question', 'question must be a string when provided');
    }
    const trimmed = raw['question'].trim();
    if (trimmed.length > 0) {
      question = trimmed.slice(0, MAX_QUESTION_CHARS);
    }
  }

  // ---- objective (optional) ----
  let objective: string | undefined;
  if (raw['objective'] !== undefined) {
    if (typeof raw['objective'] !== 'string') {
      throw fieldError('objective', 'objective must be a string when provided');
    }
    objective = (raw['objective'] as string).slice(0, 5_000);
  }

  // ---- hintUsage (optional) ----
  let hintUsage: Array<{ level: string; timestamp: string }> | undefined;
  if (raw['hintUsage'] !== undefined) {
    if (!Array.isArray(raw['hintUsage'])) {
      throw fieldError('hintUsage', 'hintUsage must be an array when provided');
    }
    hintUsage = (raw['hintUsage'] as unknown[])
      .slice(0, MAX_HINT_HISTORY)
      .map((item, idx) => {
        if (item === null || typeof item !== 'object' || Array.isArray(item)) {
          throw fieldError(
            `hintUsage[${idx}]`,
            'Each hintUsage entry must be an object'
          );
        }
        const entry = item as Record<string, unknown>;
        if (typeof entry['level'] !== 'string') {
          throw fieldError(
            `hintUsage[${idx}].level`,
            'level must be a string'
          );
        }
        if (typeof entry['timestamp'] !== 'string') {
          throw fieldError(
            `hintUsage[${idx}].timestamp`,
            'timestamp must be a string'
          );
        }
        return {
          level: entry['level'] as string,
          timestamp: entry['timestamp'] as string,
        };
      });
  }

  return {
    mode: mode as AssistantMode,
    hintLevel: hintLevel as HintLevel,
    recentTranscript,
    recentCommands: validatedCommands,
    question,
    objective,
    hintUsage,
  };
}

// ------------------------------------------------------------------
// Internal helpers
// ------------------------------------------------------------------

function fieldError(field: string, message: string): Error {
  return Object.assign(new Error(message), { field, code: 'VALIDATION_ERROR' });
}
