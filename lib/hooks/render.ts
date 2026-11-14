/**
 * The shape of a studied pattern, and how it is written out for the
 * model.
 *
 * In its own file because it imports nothing. The queries beside it
 * reach for the database and, through that, next/headers, and a test
 * that only wants to check what reaches the model should not have to
 * drag a request context in to do it.
 */
/** Where a pattern applies. Spoken hooks are what Hook Lab writes. */
export const APPLIES_TO = ["hook", "title", "thumbnail", "caption"] as const;
export type AppliesTo = (typeof APPLIES_TO)[number];

export const APPLIES_LABEL: Record<AppliesTo, string> = {
  hook: "Spoken hook",
  title: "Title",
  thumbnail: "Thumbnail text",
  caption: "Caption",
};

export interface HookPattern {
  id: number;
  name: string;
  source: string | null;
  what_it_does: string;
  example: string | null;
  active: boolean;
  applies_to: AppliesTo;
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
export function renderPatterns(
  patterns: HookPattern[],
  appliesTo: AppliesTo = "hook",
): string {
  // Filtered by where it applies, not just by whether it is on. A
  // thumbnail note handed to the spoken-hook writer does not sit there
  // harmlessly: the model tries to honour it, and the hook comes out
  // worse while the page still looks like the feature is working.
  const live = patterns.filter((p) => p.active && p.applies_to === appliesTo);
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
