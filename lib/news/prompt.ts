/**
 * Reacting to something that happened.
 *
 * This is the one place in the app where an unverified number is allowed
 * near the output, and getting that distinction right is the whole
 * module. Everywhere else the guardrail is flat: do not state a figure
 * that is not in his verified facts. A news reaction is inherently about
 * a figure somebody else reported, so a flat rule would make the feature
 * impossible and a relaxed rule would let a licensed lender publish a
 * rate he has not checked as his own claim.
 *
 * The line drawn here is attribution. A number from the article may be
 * repeated only as something the article says, named as such, never as
 * his own statement and never extrapolated into a second number. "Freddie
 * Mac put the thirty year at six point two on Thursday" is reporting.
 * "Rates are at six point two, so your payment on four hundred thousand
 * is X" is two compliance problems in one sentence.
 *
 * Everything here is pure and exported, so what reaches the model can be
 * asserted in a test without a network call.
 */

export interface NewsInput {
  /** The headline, or whatever he can remember of it. */
  headline: string;
  /** Whatever text he pasted or read out. May be empty. */
  detail?: string | null;
  /** Who reported it, for the attribution the rules below demand. */
  source?: string | null;
  url?: string | null;
  /** Who he is talking to about it. */
  audience?: string | null;
}

export const NEWS_SYSTEM = `You are writing one short piece reacting to something that just happened, in the creator's own voice.

WHAT A GOOD REACTION IS
- It says what this means for the person watching, not what happened. They can read the news. They cannot read what it does to their week.
- It takes a position. A reaction that lists both sides and shrugs is not worth posting.
- It is early rather than complete. Nobody needs the fourth take with more context, they need the first one that is useful.

NUMBERS FROM THE ARTICLE. Read this twice.
- Any figure, rate, percentage or date that came from the article may appear ONLY as something the article or the named source said, and it must be attributed in the same sentence. "Freddie Mac put the thirty year at six point two on Thursday" is fine. "Rates are six point two" is not, because that is the creator stating it as fact.
- Never do arithmetic on a figure from the article. Do not turn a rate into a payment, a percentage into a dollar amount, or a monthly number into an annual one. A calculation presents a derived number as the creator's own, which is exactly what attribution was protecting against.
- Never add a figure the article did not contain. Not a round number, not an estimate, not "roughly".
- If the article has no figures, write the reaction without any. This is normal and the piece is usually better for it.

ALSO
- No emoji. At most three hashtags, in the caption only.
- Do not predict what happens next with any confidence. "This is what I would watch" is allowed; "rates will come down by spring" is not.
- If the news is thin or you cannot tell what it actually says, say so in notes rather than padding it out.`;

export const NEWS_SHAPE = `{"hook":"the opening line, said out loud","body":"the reaction itself, 80 to 160 words","caption":"the post caption, with at most three hashtags","notes":"one line: what you deliberately did not claim"}`;

export function newsUserPrompt(input: NewsInput): string {
  const parts = [`WHAT HAPPENED\n${input.headline.trim()}`];

  const detail = input.detail?.trim();
  if (detail) {
    parts.push(
      `WHAT THE ARTICLE SAYS
Everything below came from the article, not from the creator. Any figure in here is the article's, and the attribution rules apply to all of it.

${detail}`,
    );
  } else {
    parts.push(
      `NO ARTICLE TEXT WAS GIVEN
So there are no figures you may use at all. Write the reaction from the headline alone, and say in notes that you worked from the headline only.`,
    );
  }

  const source = input.source?.trim();
  if (source) {
    parts.push(`WHO REPORTED IT\n${source}${input.url?.trim() ? `\n${input.url.trim()}` : ""}`);
  } else if (detail) {
    parts.push(
      `NO SOURCE WAS NAMED
Attribution has to name someone, so do not repeat any figure from the text above. Write the reaction around what it means instead.`,
    );
  }

  if (input.audience?.trim()) parts.push(`WHO HE IS TALKING TO\n${input.audience.trim()}`);

  return parts.join("\n\n");
}

export interface NewsOutput {
  hook: string;
  body: string;
  caption: string;
  notes: string;
}

/** What came back, made safe to show. */
export function normalizeNews(raw: unknown): NewsOutput | null {
  const row = (raw ?? {}) as Record<string, unknown>;
  const text = (key: string, max: number) =>
    (typeof row[key] === "string" ? (row[key] as string).trim() : "").slice(0, max);

  const body = text("body", 4000);
  const hook = text("hook", 400);
  if (!body && !hook) return null;
  return {
    hook,
    body,
    caption: text("caption", 2200),
    notes: text("notes", 600),
  };
}

/**
 * Figures in the finished piece that did not come from anywhere given.
 *
 * The hashtag cap is enforced on the way out as well as asked for,
 * because a prompt is a strong request and a flat rule deserves a
 * guarantee. The same belt is wanted here and cannot be the same
 * braces: stripping a number would mangle the sentence around it, and
 * the app cannot tell a legitimate attribution from an invented claim.
 *
 * So this does not change the output. It points. Anything it finds is
 * shown to him above the draft, and he decides, which is the right
 * division of labour for a licensed professional's public content.
 *
 * Deliberately narrow about what counts as a figure. "One thing I would
 * watch" and "2026" are not claims, and a warning that fires on those
 * is a warning he learns to scroll past, which is worse than none.
 */
export function unsourcedFigures(output: NewsOutput, sources: string[]): string[] {
  const haystack = normaliseDigits(sources.join(" "));
  // Matched against the text as written, not against the normalised
  // copy, so what he is shown is the figure as it appears in the draft.
  // Showing him "400000" when the draft says "400,000" sends him
  // searching for something that is not there.
  const text = [output.hook, output.body, output.caption].filter(Boolean).join(" ");

  const found = new Set<string>();
  for (const match of text.matchAll(FIGURE)) {
    const figure = match[0].replace(/[.,\s]+$/, "").trim();
    if (!figure) continue;
    // A year on its own is a date, not a claim about anything.
    if (/^(19|20)\d{2}$/.test(figure.replace(/\D/g, "")) && !/[%$]/.test(figure)) continue;
    if (!haystack.includes(normaliseDigits(figure))) found.add(figure);
  }
  return [...found];
}

/** Numerals as he says them out loud. */
const SPOKEN =
  "(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)";

/**
 * The shapes a claim-like figure takes.
 *
 * A percentage, an amount of money, a decimal, a number with a
 * magnitude word after it, or any number of three digits or more.
 * A bare one or two digit number is almost always counting something.
 */
const FIGURE = new RegExp(
  [
    // Money, with an optional magnitude after it.
    String.raw`\$\s?\d[\d,.]*\s?(?:k\b|m\b|million|billion)?`,
    // A percentage, in digits or spoken.
    String.raw`\d[\d,.]*\s?(?:percent|%)`,
    String.raw`${SPOKEN}(?:\s+point\s+${SPOKEN})?\s+percent`,
    // A decimal, in digits or spoken. "six point two" is how he says a
    // rate out loud, so the model writes it that way, and a check that
    // only reads digits would miss every invented rate in a spoken piece.
    String.raw`\d+\.\d+`,
    String.raw`${SPOKEN}\s+point\s+${SPOKEN}`,
    // A number with a magnitude word after it, digits or spoken.
    String.raw`\d[\d,]*\s?(?:k\b|m\b|thousand|million|billion)`,
    String.raw`(?:${SPOKEN}|hundred|thousand|million)(?:\s+(?:${SPOKEN}|hundred|thousand|million))*\s+(?:hundred|thousand|million|billion)`,
    // A comma-grouped number, kept whole. Without this branch "400,000"
    // falls through to the plain-digits rule below and is reported as
    // "400" and "000", which is two numbers he never wrote.
    String.raw`\d{1,3}(?:,\d{3})+`,
    // Anything of three digits or more. One or two digits is counting.
    String.raw`\d{3,}`,
  ].join("|"),
  "gi",
);

/**
 * Spelled-out digits back to digits, so "six point two" in the article
 * still matches "6.2" in the draft. Only the digits themselves: turning
 * every word into a number would make the comparison meaningless.
 */
function normaliseDigits(text: string): string {
  const WORDS: Record<string, string> = {
    zero: "0", one: "1", two: "2", three: "3", four: "4",
    five: "5", six: "6", seven: "7", eight: "8", nine: "9",
  };
  return text
    .toLowerCase()
    .replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine)\b/g, (w) => WORDS[w])
    .replace(/\s*point\s*/g, ".")
    .replace(/,/g, "")
    .replace(/\s+/g, " ");
}
