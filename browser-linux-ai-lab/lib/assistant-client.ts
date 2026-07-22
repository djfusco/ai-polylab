import type {
  AssistantRequest,
  AssistantResponse,
  AssistantInteraction,
  AssistantMode,
} from './v86-types';

// ---------------------------------------------------------------------------
// In-memory interaction store (max 20 entries)
// ---------------------------------------------------------------------------

const interactions: AssistantInteraction[] = [];
const MAX_INTERACTIONS = 20;

// ---------------------------------------------------------------------------
// Client-side rate limiting (demo guard)
// ---------------------------------------------------------------------------

const RATE_LIMIT_MS = 5_000; // 5 seconds between requests
let lastRequestAt = 0;

/**
 * Returns true when enough time has elapsed since the last request.
 */
export function canMakeRequest(): boolean {
  return Date.now() - lastRequestAt >= RATE_LIMIT_MS;
}

/**
 * Returns the number of milliseconds remaining before the next request is
 * allowed, or 0 if a request can be made immediately.
 */
export function getTimeUntilNextRequest(): number {
  const elapsed = Date.now() - lastRequestAt;
  return Math.max(0, RATE_LIMIT_MS - elapsed);
}

// ---------------------------------------------------------------------------
// Core API call
// ---------------------------------------------------------------------------

/**
 * Sends an {@link AssistantRequest} to the server-side `/api/assistant`
 * endpoint and returns the structured {@link AssistantResponse}.
 *
 * This function never throws; all errors are surfaced as an
 * `AssistantResponse` whose `message` field describes the problem.
 */
export async function askAssistant(
  request: AssistantRequest,
): Promise<AssistantResponse> {
  const now = Date.now();

  // Enforce client-side rate limit
  if (!canMakeRequest()) {
    const wait = Math.ceil(getTimeUntilNextRequest() / 1_000);
    return {
      message: `Please wait ${wait} second${wait !== 1 ? 's' : ''} before making another request.`,
      confidence: 'high',
    };
  }

  lastRequestAt = now;

  let response: AssistantResponse;

  try {
    const httpResponse = await fetch('/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!httpResponse.ok) {
      // Try to parse a structured error body from the server
      let errorMessage = `Request failed with status ${httpResponse.status}`;
      try {
        const errorBody = (await httpResponse.json()) as {
          error?: string;
          message?: string;
        };
        const detail = errorBody.error ?? errorBody.message;
        if (detail && typeof detail === 'string') {
          errorMessage = detail;
        }
      } catch {
        // Body was not JSON — use the status-based message
      }

      response = {
        message: errorMessage,
        confidence: 'low',
      };
    } else {
      const body = (await httpResponse.json()) as AssistantResponse;
      response = body;
    }
  } catch (err) {
    // Network error or JSON parse failure
    const message =
      err instanceof Error
        ? `Network error: ${err.message}`
        : 'An unexpected error occurred while contacting the assistant.';

    response = {
      message,
      confidence: 'low',
    };
  }

  // Record the interaction
  const interaction: AssistantInteraction = {
    timestamp: new Date(now).toISOString(),
    mode: request.mode,
    hintLevel: request.hintLevel,
    question: request.question,
    response,
  };

  interactions.push(interaction);

  // Trim to the maximum allowed number of stored interactions
  while (interactions.length > MAX_INTERACTIONS) {
    interactions.shift();
  }

  return response;
}

// ---------------------------------------------------------------------------
// Interaction history accessors
// ---------------------------------------------------------------------------

/**
 * Returns a shallow copy of all recorded assistant interactions (up to 20).
 */
export function getInteractions(): AssistantInteraction[] {
  return [...interactions];
}

/**
 * Clears the in-memory interaction history.
 */
export function clearInteractions(): void {
  interactions.length = 0;
}

/**
 * Returns the hint-type interactions from the last 5 hint requests, ordered
 * oldest-first, in the shape expected by {@link AssistantRequest.hintUsage}.
 */
export function getHintUsageHistory(): Array<{
  level: string;
  timestamp: string;
}> {
  const hintModes: AssistantMode[] = ['hint'];
  return interactions
    .filter((i) => hintModes.includes(i.mode))
    .slice(-5)
    .map((i) => ({ level: i.hintLevel as string, timestamp: i.timestamp }));
}
