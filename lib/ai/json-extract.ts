/**
 * Pull a JSON value out of raw model text.
 *
 * Reasoning models often wrap JSON in prose ("Here's the analysis:"),
 * markdown fences, or trailing commentary, and the JSON itself may
 * contain braces/brackets inside string literals (e.g. a caption like
 * "he said {surprise}"). A naive `text.indexOf('{')` .. `lastIndexOf('}')`
 * slice breaks on either of those. So:
 *
 *   1. Try a plain JSON.parse() first -- covers the common case where the
 *      model returned nothing but JSON.
 *   2. Fall back to a bracket walk that tracks whether we're inside a
 *      string literal (respecting escape sequences), so braces/brackets
 *      that appear inside quoted strings don't corrupt the depth count.
 */
export function extractJson<T = unknown>(raw: string): T {
  const trimmed = raw.trim();

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // fall through to the bracket walk
  }

  const OPENERS = new Set(["{", "["]);
  const CLOSER_FOR: Record<string, string> = { "{": "}", "[": "]" };

  let startIdx = -1;
  let opener = "";
  for (let i = 0; i < trimmed.length; i++) {
    if (OPENERS.has(trimmed[i])) {
      startIdx = i;
      opener = trimmed[i];
      break;
    }
  }
  if (startIdx === -1) {
    throw new Error("No JSON object or array found in model output");
  }

  const closer = CLOSER_FOR[opener];
  let depth = 0;
  let inString = false;
  let escaped = false;
  let endIdx = -1;

  for (let i = startIdx; i < trimmed.length; i++) {
    const ch = trimmed[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === opener) {
      depth++;
    } else if (ch === closer) {
      depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }

  if (endIdx === -1) {
    throw new Error(
      "Unbalanced JSON in model output (likely truncated -- check max_tokens)",
    );
  }

  const candidate = trimmed.slice(startIdx, endIdx + 1);
  return JSON.parse(candidate) as T;
}
