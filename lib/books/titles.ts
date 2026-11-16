/**
 * Suggesting a title and a subtitle for a book.
 *
 * WHY THIS IS A SEPARATE FILE
 * A title is not a shorter version of an outline. It is the one line that
 * decides whether the book gets picked up, and the rules for writing one
 * are specific enough that burying them in the outline prompt would mean
 * neither prompt was any good. Pure and exported, like prompts.ts, so the
 * exact text that reaches the model is assertable without a network call.
 *
 * WHERE THE RULES COME FROM
 * He asked for suggestions "like Myron Golden would give". There is no
 * published Myron Golden framework for titling a book that I could find,
 * so this is NOT a reconstruction of one, and it does not claim to be.
 * What it is built on is the two covers of his own that could be
 * confirmed:
 *
 *   From the Trash Man to the Cash Man
 *     How Anyone Can Get Rich Starting From Anywhere
 *
 *   B.O.S.S. Moves
 *     Business Optimization Success Secrets From A Million Dollar Round Table
 *
 * Two covers is a thin evidence base and the rules below are only as good
 * as the reading of them. What the two actually share:
 *
 *   The title is short, and it is not a topic. "Trash Man to Cash Man" is
 *   two people. "Moves" is an action. Neither title describes a subject,
 *   which is what almost every amateur title does.
 *
 *   The title has a sound to it. Trash and Cash rhyme. B.O.S.S. is an
 *   acronym that spells a word. The title is built to be said out loud
 *   and repeated by someone who has not read the book.
 *
 *   The subtitle carries the whole promise, and it does one of exactly
 *   two jobs. Either it kills the reader's excuse before the reader can
 *   raise it ("anyone", "starting from anywhere"), or it says where the
 *   knowledge came from ("from a Million Dollar Round Table"). The title
 *   gets attention; the subtitle is what answers "why should I believe
 *   you".
 *
 * So suggestions come back as a spread across those two subtitle jobs
 * rather than six variations on one, which is what makes the set useful
 * to choose from instead of six near-identical lines.
 *
 * THE ONE PLACE THIS DEPARTS FROM THE SOURCE
 * "How Anyone Can Get Rich Starting From Anywhere" is a promise about
 * money. Aaron is a licensed loan officer. A book of his promising an
 * income or wealth outcome is not a style question, it is a compliance
 * problem, and it stays a problem whoever else has done it successfully.
 * So the promise rule is deliberately narrower than the source: the
 * subtitle may promise what the reader will UNDERSTAND or be able to DO,
 * never what they will EARN. Suggestions that cross that line are not
 * thrown away silently, they come back marked, because a rule enforced
 * invisibly is a rule he cannot argue with.
 */

/** The two jobs a subtitle is allowed to do, per the covers above. */
export const SUBTITLE_JOBS = ["objection", "proof"] as const;
export type SubtitleJob = (typeof SUBTITLE_JOBS)[number];

export const JOB_LABEL: Record<SubtitleJob, string> = {
  objection: "Kills the excuse",
  proof: "Says where it came from",
};

export interface TitleIdea {
  title: string;
  subtitle: string;
  job: SubtitleJob;
  /** One line on why this one works, so he can judge rather than guess. */
  why: string;
  /**
   * Set when the subtitle promises an outcome he is not licensed to
   * promise. Carries the phrase that tripped it, so the warning on the
   * page can quote it rather than being vague.
   */
  risky?: string;
}

export const TITLES_SYSTEM = `You are titling a non-fiction book for someone who already has an audience.

You will be given what the book argues and who it is for. Return six title and subtitle pairs.

WHAT A TITLE IS
The title is not a description of the subject. A title that describes the subject is the thing you must not produce. "Understanding Mortgage Options" is a subject. "From the Trash Man to the Cash Man" is a book.

TITLE RULES
- Two to eight words. Under 48 characters. Shorter is better.
- Name a person, an identity, or a move. Not a topic, not a field, not a question.
- Build it to be said out loud and repeated by someone who has not read it. Internal rhyme, a repeated consonant, or an acronym that spells a real word, where one comes naturally. Never force one.
- No colon anywhere in the title. The part after the colon is the subtitle and it goes in its own field.
- No gerund openings. "Building", "Mastering", "Unlocking" and "Navigating" are banned first words.
- No two of your six titles may lean on the same device.

SUBTITLE RULES
The subtitle carries the entire promise. It does exactly ONE of these two jobs, and you will be told how many of each to return:

objection: Kill the reader's main excuse inside the subtitle, before they can raise it. The excuse is whatever makes this specific reader think the book is not for them. "How anyone can, starting from anywhere" is this job done well, because the reader's excuse was that they are starting with nothing.

proof: Say where the knowledge came from, so the promise is believable. A number of years, a count of deals, a room he was in, a role he holds. Only ever something given to you below. If you have nothing to point at, do not invent a credential, return an objection subtitle instead.

- Six to sixteen words.
- Name the reader or their situation concretely. "For agents" is weak; "for the agent who has read every script and still freezes on the call" is the job.
- Plain words. A subtitle full of abstractions reads as a book nobody finished.

WHAT YOU MAY NOT PROMISE
He is a licensed mortgage loan officer, so a promise about money is a compliance problem, not a style choice.
- Never promise an income, a profit, a return, wealth, getting rich, financial freedom, or a specific rate or payment.
- Never promise a guarantee, or that something is risk free, or that a result is certain.
- You MAY promise what the reader will understand, see differently, stop doing, or be able to do. That is the whole room you have, and it is enough.

DO NOT
- Do not invent a statistic, a client story, a credential, an award or a sales figure. Only use what you are given.
- Do not use a dash as punctuation anywhere.
- Do not reuse his existing book or program names.

WHY
Each pair gets one line saying what the title is doing and which excuse or proof the subtitle is leaning on. Write it to someone deciding between six options, not as praise.`;

export const TITLES_SHAPE = `{"ideas":[{"title":"short, no colon","subtitle":"the whole promise","job":"objection","why":"one line"}]}`;

export function titlesUserPrompt(input: {
  premise?: string | null;
  audience?: string | null;
  currentTitle?: string | null;
  material?: string[];
}): string {
  const parts: string[] = [];

  const premise = input.premise?.trim();
  parts.push(
    premise
      ? `WHAT THE BOOK ARGUES\n${premise}`
      : `WHAT THE BOOK ARGUES\nNot said yet. Title from the audience and his material below, and keep the promises modest, because you are guessing at the argument.`,
  );

  const audience = input.audience?.trim();
  if (audience) {
    parts.push(
      `WHO IT IS FOR\n${audience}\n\nTheir excuse for not reading it is in there somewhere. Find it and put it in the objection subtitles.`,
    );
  }

  const current = input.currentTitle?.trim();
  if (current) {
    parts.push(
      `WHAT HE IS CALLING IT NOW\n${current}\n\nDo not return this back to him, and do not return a near miss of it. He is asking because he wants options he has not already had.`,
    );
  }

  const material = (input.material ?? []).map((m) => m.trim()).filter(Boolean);
  if (material.length > 0) {
    parts.push(
      `HIS OWN MATERIAL
Things he has already said or written. Mine these for his phrasing, and for anything that is a real credential you can point at in a proof subtitle. Nothing here is a title.

${material.map((m) => `- ${m}`).join("\n")}`,
    );
  }

  parts.push(
    `RETURN\nSix pairs: four with job "objection", two with job "proof". If his material gives you nothing real to point at, return six "objection" instead of inventing a credential.`,
  );

  return parts.join("\n\n");
}

/**
 * Phrases that would put a promise in the subtitle he cannot make.
 *
 * Matched on the way out rather than only asked for in the prompt, for the
 * same reason the house rules are enforced twice: the prompt gets better
 * sentences, the pass gets a guarantee. A match marks the idea, it does not
 * delete it, so he can see what it wanted to say and overrule this if the
 * match is silly.
 *
 * Deliberately not a blanket ban on money words. A subtitle may say the
 * word "commission" or "mortgage", because this is a book about his work.
 * What it may not do is promise the reader an amount or an outcome.
 */
const RISKY_PROMISE: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bget(ting)?\s+rich\b/i, "promises getting rich"],
  [/\bgrow\s+rich\b/i, "promises getting rich"],
  [/\bbuild\s+wealth\b/i, "promises wealth"],
  [/\bfinancial\s+freedom\b/i, "promises financial freedom"],
  [/\bretire\s+(early|rich)\b/i, "promises a retirement outcome"],
  [/\b(six|seven|eight)[\s-]figure/i, "promises an income figure"],
  // No \b before the dollar sign: a word boundary needs a word character
  // on one side, and neither a space nor "$" is one, so "\b\$" matches
  // nothing at all. The test for "Save $400 a month" is what caught it.
  [/\$\s?\d/, "promises a dollar figure"],
  [/\b\d+\s?%/i, "names a rate or a percentage"],
  [/\bguarantee(d|s)?\b/i, "says guaranteed"],
  [/\brisk[\s-]free\b/i, "says risk free"],
  [/\bdouble\s+your\b/i, "promises a multiple"],
  [/\b(triple|10x|ten\s?x)\s+your\b/i, "promises a multiple"],
  [/\bmake\s+(you\s+)?(more\s+)?money\b/i, "promises making money"],
  [/\bearn\s+(more|\d)/i, "promises earnings"],
  [/\bpassive\s+income\b/i, "promises passive income"],
];

/** The phrase that makes a subtitle a compliance problem, or null. */
export function riskyPromise(subtitle: string): string | null {
  for (const [re, label] of RISKY_PROMISE) {
    if (re.test(subtitle)) return label;
  }
  return null;
}

/** First words that make a title sound like a course module. */
const WEAK_OPENERS =
  /^(building|mastering|unlocking|navigating|understanding|exploring|introduction\s+to|the\s+complete\s+guide)/i;

const MAX_TITLE_CHARS = 48;

/**
 * Clean up what came back so the page can trust it.
 *
 * The failure worth handling by name is the model putting the whole thing
 * in the title field as "Title: Subtitle". That is the single most likely
 * mistake given it has spent its life seeing titles written that way, and
 * silently showing him a title with a colon in it would undo the entire
 * point of asking for the two fields separately. So a colon in the title
 * is split rather than rejected: the left side is the title, and the right
 * side becomes the subtitle if the subtitle field came back empty.
 */
export function normalizeTitles(raw: unknown): TitleIdea[] {
  const ideas = Array.isArray((raw as { ideas?: unknown })?.ideas)
    ? ((raw as { ideas: unknown[] }).ideas as unknown[])
    : [];

  const out: TitleIdea[] = [];
  const seen = new Set<string>();

  for (const item of ideas) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;

    let title = typeof row.title === "string" ? row.title.trim() : "";
    let subtitle = typeof row.subtitle === "string" ? row.subtitle.trim() : "";
    if (!title) continue;

    // "Title: Subtitle" arrived in one field.
    const colon = title.indexOf(":");
    if (colon > 0) {
      const tail = title.slice(colon + 1).trim();
      title = title.slice(0, colon).trim();
      if (!subtitle && tail) subtitle = tail;
    }
    if (!title || !subtitle) continue;

    // Quotes around a title are the model presenting it, not part of it.
    title = title.replace(/^["'“‘]|["'”’]$/g, "").trim();
    if (!title) continue;

    if (title.length > MAX_TITLE_CHARS) continue;
    if (WEAK_OPENERS.test(title)) continue;

    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const job: SubtitleJob =
      row.job === "proof" ? "proof" : "objection";

    const idea: TitleIdea = {
      title,
      subtitle,
      job,
      why: typeof row.why === "string" ? row.why.trim() : "",
    };
    const risk = riskyPromise(subtitle);
    if (risk) idea.risky = risk;

    out.push(idea);
    if (out.length === 6) break;
  }

  return out;
}
