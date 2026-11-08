/**
 * The things that must be true of every word this app writes.
 *
 * Two layers, for the same reason the hashtag cap has two: a prompt is a
 * strong request and the model mostly honours it, but "mostly" is not good
 * enough for a rule the person stated flatly. So the rule is asked for in
 * the prompt, where it produces better sentences, and then enforced on the
 * way out, where it produces a guarantee.
 *
 * The enforced pass runs on the raw model response, before the JSON is
 * parsed. That is safe because every substitution here puts back ordinary
 * letters, commas and spaces, never a quote or a brace, so a valid JSON
 * document stays valid.
 */

/**
 * Brand facts, in one place.
 *
 * If any of this changes, this is the only block to edit. It is hard-coded
 * rather than stored in the database on purpose: a retired brand name
 * appearing in a recruiting post is the kind of mistake that should be
 * impossible, not merely configured against.
 */
export const BRAND = {
  team: "Rise Up Team",
  brokerage: "eXp Realty",
  /**
   * What R.I.S.E. actually stands for. Confirmed by Aaron, not inferred.
   *
   * The second word is interchangeable: he uses Influence and Impact and
   * counts both as correct. So the rule is not "these exact four words",
   * it is "these four slots, and the second one has two right answers".
   * Anything else is invented, which is what started this.
   */
  rise: ["Reach", "Influence", "Scale", "Elevate"],
  riseAlternate: "Impact",
  /** Names that must never reach a slide, a caption or an email again. */
  retired: ["Rise Up Realty"],
} as const;

export const HOUSE_RULES = `
HOUSE RULES -- these override every other instruction, including the voice profile:

PUNCTUATION
- Never use a dash as punctuation. Not the long em dash character, not the
  shorter en dash, not a double hyphen standing in for one. Not for an aside,
  not for a pause, not for a dramatic break before the last few words.
- Write what the dash was doing instead: a comma, a colon, a full stop, or a
  new sentence. Most of the time a full stop is stronger anyway.
- For a span of numbers use "to": six to eight slides, not six-eight.
- A hyphen inside a single word (first-time, zero-down) is fine and is not
  what this rule is about.

NAMES
- The team is "${BRAND.team}", part of ${BRAND.brokerage}. Write
  "${BRAND.team}", or "${BRAND.team} | ${BRAND.brokerage}" where the brokerage
  matters.
- "${BRAND.retired[0]}" is a retired name. It must never appear: not in body
  text, not in a hashtag, not in a sign-off. Neither must the hashtag form of
  it.
- R.I.S.E. stands for ${BRAND.rise.join(", ")}. The second word is
  interchangeable: ${BRAND.rise[1]} or ${BRAND.riseAlternate}, both are his and
  either may be used. Expand it that way or do not expand it at all. Never
  invent a different expansion, and never present one as the team's own
  wording unless it is this one.
`.trim();

// ---------------------------------------------------------------------
// The enforced pass
// ---------------------------------------------------------------------

/** Anything that looks like a link, which must come through untouched. */
const URLISH = /\bhttps?:\/\/\S+|\bwww\.\S+|\b\S+@\S+\.\S+/gi;

/**
 * Runs a transform on everything except the links.
 *
 * A URL is the one place in this kind of writing where a double hyphen is
 * load-bearing, and rewriting one silently breaks a link the person is
 * counting on.
 *
 * Each link is swapped for a marker and the text is then cleaned in one
 * piece, rather than cleaned in the gaps between links. Cleaning the gaps
 * looks equivalent and is not: the gap before a link ends in the space that
 * separates the two, the tidy-up strips trailing spaces, and the sentence
 * comes back with the word welded to the link. The marker holds that space
 * open by standing in the line where the URL was.
 *
 * The marker is built from a control character and lowercase letters only,
 * so nothing in this file can match it: no dash, no digit for the number
 * span rule to catch, no brand name.
 */
function outsideLinks(text: string, fn: (part: string) => string): string {
  const links: string[] = [];
  const marker = (i: number) => `\u0000${"a".repeat(i + 1)}\u0000`;
  const masked = text.replace(URLISH, (m) => {
    links.push(m);
    return marker(links.length - 1);
  });
  const cleaned = fn(masked);
  return cleaned.replace(/\u0000(a+)\u0000/g, (whole, run: string) => {
    const link = links[run.length - 1];
    return link === undefined ? whole : link;
  });
}

const DASH_RUN = /[ \t]*(?:—|–|--)[ \t]*/g;

/**
 * Takes the dashes out without leaving the sentence limping.
 *
 * A dash is doing one of three jobs, and each wants a different repair. A
 * span of numbers wants a hyphen so it stays tight. A dash at the edge of a
 * line was decoration and simply goes. Everything else was a break in a
 * sentence, and a comma is the honest replacement: it keeps the clause the
 * writer actually wrote rather than guessing at a full stop and leaving a
 * fragment behind.
 *
 * Only spaces and tabs around the dash are consumed, never a line break, so
 * two lines are never silently welded into one.
 */
export function unDash(text: string): string {
  let out = text.replace(/(\d)[ \t]*(?:—|–|--)[ \t]*(\d)/g, "$1-$2");

  out = out.replace(DASH_RUN, (match: string, offset: number, full: string) => {
    const before = full.slice(0, offset).replace(/[ \t]+$/, "");
    const after = full.slice(offset + match.length);
    // Start of the text, or the dash opened a line: it was a bullet or an
    // ornament, and nothing is owed to the sentence.
    if (!before || before.endsWith("\n")) return "";
    // End of the text, or the dash closed a line: same.
    if (!after.trim() || /^[\r\n]/.test(after)) return "";
    // Already punctuated on the left, so a comma would double up.
    if (/[.,;:!?([]/.test(before.slice(-1))) return " ";
    return ", ";
  });

  return out
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .replace(/,[ \t]*,/g, ",")
    .replace(/[ \t]+$/gm, "");
}

/**
 * Replaces the retired brand name wherever it appears.
 *
 * Case is matched rather than normalized, because this text lands in three
 * places with three different habits: slide headlines are set in capitals,
 * captions are title case, and his lowercase posts are lowercase on purpose.
 * Returning "Rise Up Team" into a shouting headline would be its own tell.
 */
export function retireOldNames(text: string): string {
  return text
    .replace(/#[ \t]?RiseUpRealty\b/gi, "#RiseUpTeam")
    .replace(/\bRISE[ \t]UP[ \t]REALTY\b/g, "RISE UP TEAM")
    .replace(/\brise[ \t]up[ \t]realty\b/g, "rise up team")
    .replace(/\bRiseUpRealty\b/g, "RiseUpTeam")
    .replace(/\briseuprealty\b/g, "riseupteam")
    .replace(/\bRise[ \t]Up[ \t]Realty\b/gi, "Rise Up Team");
}

/**
 * The single call that makes the house rules true of a piece of text.
 *
 * Applied to the whole model response at the point every route shares, so a
 * route added later inherits it without anybody remembering to.
 */
export function applyHouseRules(text: string): string {
  if (!text) return text;
  return outsideLinks(text, (part) => retireOldNames(unDash(part)));
}
