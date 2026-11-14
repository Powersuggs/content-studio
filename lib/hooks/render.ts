/**
 * The shape of a studied pattern, and how it is written out for the
 * model.
 *
 * In its own file because it imports nothing. The queries beside it
 * reach for the database and, through that, next/headers, and a test
 * that only wants to check what reaches the model should not have to
 * drag a request context in to do it.
 */
export interface HookPattern {
  id: number;
  name: string;
  source: string | null;
  what_it_does: string;
  example: string | null;
  active: boolean;
}

/**
 * The patterns, written out for the model.
 *
 * Returns an empty string when he has none, rather than a heading with
 * nothing under it. A prompt that says "HIS OWN PATTERNS" followed by
 * silence invites the model to invent some.
 *
 * Pure apart from the read, and exported, so what reaches the model can
 * be asserted in a test.
 */
export function renderPatterns(patterns: HookPattern[]): string {
  const live = patterns.filter((p) => p.active);
  if (live.length === 0) return "";

  const lines = live.map((p) => {
    const parts = [`- ${p.name}${p.source ? ` (noticed in ${p.source})` : ""}: ${p.what_it_does}`];
    if (p.example) parts.push(`    shape: ${p.example}`);
    return parts.join("\n");
  });

  return `
PATTERNS HE HAS STUDIED AND WANTS USED
These come from creators he has pulled apart himself, and they beat the
archetypes above where the two disagree. Apply the mechanism, not the
wording: the example shows the shape, it is not a line to copy.

${lines.join("\n")}
`.trim();
}
