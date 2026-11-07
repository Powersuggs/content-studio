import type { FormatId } from "./formats";

/**
 * What each format actually is, told to the model.
 *
 * Every one of these is the same idea, so the temptation is to write one
 * prompt and change the word "carousel" to "reel". That produces seven
 * versions of the same paragraph chopped differently, which is exactly
 * what makes repurposed content feel repurposed.
 *
 * So each format gets told what the medium is FOR, not just how long it
 * is. A reel is watched by someone who did not choose it. A carousel is
 * swiped by someone who stopped. An email is opened by someone who asked
 * to hear from you. That difference is what changes the writing.
 */

/** The normalized shape every format comes back in, so one renderer works. */
export interface GeneratedOutput {
  /** Headline, subject line, or first slide. Always present. */
  title: string;
  /** The numbered pieces: slides, frames, posts. Empty for prose formats. */
  parts: string[];
  /** Flowing text, for the formats that are prose. Empty for part formats. */
  body: string;
  /** The Instagram or platform caption, where the format has one. */
  caption: string;
  /** One line on what to do with it, or what was deliberately left out. */
  notes: string;
}

interface FormatSpec {
  /** What this medium is for, and how it differs from the others. */
  brief: string;
  /** The JSON shape to ask for. */
  shape: string;
  maxTokens: number;
}

const SPECS: Record<FormatId, FormatSpec> = {
  reel: {
    brief: `A short vertical video script, spoken to camera.

The viewer did not choose this. It arrived, and the first line decides whether they stay. Write the hook as the first words out of the mouth, not a title card. Spoken rhythm, short sentences, no clauses someone would trip over reading aloud. 30 to 45 seconds, which is roughly 90 to 130 words of actual speech. End on one clear thing to do.`,
    shape: `{"title":"the hook, the literal first words spoken","parts":[],"body":"the full script as it would be said out loud, including the hook","caption":"the Instagram caption, 1-3 short lines plus a question","notes":"one line of delivery direction, e.g. where to pause or hold up a hand"}`,
    maxTokens: 3000,
  },
  short: {
    brief: `A YouTube Short or TikTok cut, spoken to camera.

Same job as a reel but a colder audience: more of these viewers have never seen this person before, so the first line has to make sense with no context at all. No in-jokes, no "as I said last week". 25 to 40 seconds. End on a reason to follow rather than a reason to DM, because that is what this surface rewards.`,
    shape: `{"title":"the hook, the literal first words spoken","parts":[],"body":"the full script as it would be said out loud","caption":"a one-line caption plus 3-5 plain hashtags","notes":"one line of delivery direction"}`,
    maxTokens: 3000,
  },
  carousel: {
    brief: `An Instagram carousel: slides people swipe through.

This is read, not heard, and the reader already stopped scrolling to look. That buys you depth a reel cannot have, but every slide has to earn the swipe to the next one. Slide one is the hook and should state the promise plainly. Middle slides carry one idea each, in as few words as fit on a phone screen: aim for 12 to 30 words per slide, never a paragraph. The last slide is the ask.

6 to 8 slides. Write what goes ON the slide, not a description of the slide.`,
    shape: `{"title":"the text on slide 1, the hook","parts":["slide 2 text","slide 3 text","..."],"body":"","caption":"the Instagram caption that sits under the carousel","notes":"one line on the visual treatment, e.g. big numbers, one per slide"}`,
    maxTokens: 3000,
  },
  story: {
    brief: `A sequence of Instagram story frames.

Casual, fast, and gone in 24 hours, so this is the format where you can be unpolished. Talking to people who already follow you, so skip the introductions. 3 to 5 frames, one thought each, under 20 words a frame. Use a poll, question box, or link sticker on at least one frame and say which.`,
    shape: `{"title":"the text on frame 1","parts":["frame 2 text","frame 3 text","..."],"body":"","caption":"","notes":"which frame gets which sticker, and what the sticker asks"}`,
    maxTokens: 2000,
  },
  email: {
    brief: `An email to a list of people who chose to subscribe.

No hook needed, they opted in. What they need is a reason this landed today. One idea, developed properly, 200 to 400 words. A link, a reply, or a decision is a realistic ask; "follow for more" is not. It is read, not heard: short paragraphs, no stage directions.`,
    shape: `{"title":"the subject line, under 60 characters","parts":[],"body":"the email body in plain markdown, starting at the first real line","caption":"","notes":"one line on who on the list this is really for"}`,
    maxTokens: 4000,
  },
  blog: {
    brief: `A blog post, written to be found by search and read by someone who went looking.

This reader has a question and typed it somewhere. Answer it directly in the first paragraph, then earn the rest. 600 to 900 words with real subheadings. Specific beats clever here: the person is deciding something. Plain markdown, ## for subheadings.`,
    shape: `{"title":"the post title, written the way someone would search for it","parts":[],"body":"the full post in markdown with ## subheadings","caption":"a one-sentence meta description under 155 characters","notes":"one line on what would make this rank or convert better"}`,
    maxTokens: 6000,
  },
  thread: {
    brief: `A text thread, broken into numbered posts.

The first post has to work completely on its own, because most people will only see that one. Each following post should be able to stand alone too, since they get quoted separately. 5 to 8 posts, each under 280 characters. No "a thread 🧵" and no numbering inside the text, the numbering is the structure.`,
    shape: `{"title":"post 1, which must work alone","parts":["post 2","post 3","..."],"body":"","caption":"","notes":"one line on which post is the one worth quoting"}`,
    maxTokens: 3000,
  },
};

export function specFor(format: FormatId): FormatSpec {
  return SPECS[format];
}

export function systemPromptFor(format: FormatId, jsonOnly: string): string {
  const spec = SPECS[format];
  return `
You are writing one piece of content for a creator, in their own voice, from an idea they captured.

THE FORMAT
${spec.brief}

RULES
- Write the thing itself. No preamble, no "here is your carousel", no explaining the choices.
- The idea is theirs. Sharpen it, do not replace it with a more generic version of itself.
- Concrete over general: a number, a case, a thing that actually happened, beats a principle.
- If the idea is too broad for one piece, pick the strongest angle in it and commit to that. Say which angle you took in notes.
- No emoji unless the voice profile shows they use them.

${jsonOnly}

Return exactly this shape:
${spec.shape}
`.trim();
}

export function maxTokensFor(format: FormatId): number {
  return SPECS[format].maxTokens;
}

/** Normalizes whatever came back, so a missing field cannot crash a render. */
export function normalize(raw: unknown): GeneratedOutput | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const title = str(r.title);
  const body = str(r.body);
  const parts = Array.isArray(r.parts)
    ? r.parts.filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    : [];
  // A result with no title AND nothing in it is a failure, not a draft.
  if (!title && !body && parts.length === 0) return null;
  return { title, parts, body, caption: str(r.caption), notes: str(r.notes) };
}
