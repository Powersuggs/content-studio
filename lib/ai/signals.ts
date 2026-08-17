export const SIGNAL_READING_GUIDE = `
How to read the signals in this data:
- Low average watch time relative to a post's duration means a weak hook or slack pacing -- viewers are bailing early rather than watching through.
- A high save rate (saves / views) means reference value: people intend to come back to this later. Typical of tutorials, lists, and how-tos.
- A high share rate (shares / views) means identity value: people are sending it to represent themselves or their taste, not just because it was useful in the moment.
- Views far above reach means rewatching -- the same accounts are replaying it, which inflates views beyond the number of unique accounts reached. That's a sign of loop-worthy or rewatchable content, not necessarily wider distribution.
Ground every claim in the actual numbers provided. Never invent a statistic that isn't in the data.
`.trim();

export const JSON_ONLY_INSTRUCTION = `
Respond with ONLY the JSON value described below. No markdown code fences, no preamble, no commentary before or after it.
`.trim();
