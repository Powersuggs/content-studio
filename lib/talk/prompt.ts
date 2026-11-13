/**
 * Turning a spoken take into something the pipeline can hold.
 *
 * He talks for a minute or two. What comes back is a transcript, which is
 * the valuable part, plus two things the rest of the app needs in order to
 * file it: a title short enough to read in a list, and one line on the
 * angle so a week later he knows which of four takes this was.
 *
 * Both are derived here rather than asked of him, because being made to
 * name a thing before saving it is exactly the friction that stops a
 * half-formed idea getting recorded at all.
 *
 * Pure and exported so the prompt can be asserted in a test without a
 * network call.
 */

/** Shortest take worth filing. Below this it is a stray word, not an idea. */
export const MIN_TRANSCRIPT_CHARS = 40;

export const TITLE_SYSTEM = `You are reading a transcript of someone talking through one content idea out loud.

Give it a title and one line on the angle.

THE TITLE
- How THEY would say it, using their own words from the transcript where they fit.
- Under 70 characters. It is going in a list.
- Not a headline and not clickbait. A label, so they recognise this take among others.
- No colon-subtitle constructions, no "How to", no question marks unless they asked one.

THE ANGLE
- One sentence on what this take is actually arguing, not what it is about.
- "Agents think the split is the whole decision" is an angle. "Commission splits" is a topic.
- If the take wanders across several, name the strongest one.

Use only what is in the transcript. Do not add a claim they did not make.`;

export function titleShape(): string {
  return `{"title":"their words, under 70 characters","angle":"one sentence on what it argues"}`;
}

export function titleUserPrompt(transcript: string): string {
  return `TRANSCRIPT\n${transcript.trim()}`;
}

/**
 * What came back, once it has been made safe to store.
 *
 * A model asked for 70 characters will sometimes return 90, and a title
 * longer than the column allows would fail the insert rather than merely
 * read badly, so the cap is applied rather than requested. Falling back to
 * the opening words of the transcript matters more than it looks: a take
 * that cannot be titled must still be saved, because the transcript is the
 * part worth keeping and losing it to a bad title would be absurd.
 */
export function normalizeTitle(
  raw: unknown,
  transcript: string,
): { title: string; angle: string } {
  const row = (raw ?? {}) as Record<string, unknown>;
  const title = typeof row.title === "string" ? row.title.trim() : "";
  const angle = typeof row.angle === "string" ? row.angle.trim() : "";
  return {
    title: (title || firstWords(transcript)).slice(0, 180),
    angle: angle.slice(0, 500),
  };
}

/** The opening of what he said, cut at a word rather than mid-word. */
export function firstWords(transcript: string, limit = 70): string {
  const flat = transcript.trim().replace(/\s+/g, " ");
  if (flat.length <= limit) return flat || "Untitled take";
  const cut = flat.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trimEnd()}...`;
}
