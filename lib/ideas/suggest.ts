import type { WinningPost, ReferenceMaterial } from "@/lib/queries";

/**
 * Ideas proposed from his own best posts.
 *
 * Every other tool in this app waits on an idea. He had two. The content
 * machine is only as good as what goes into the top of it, and "think of
 * something to post about" is the step that actually stalls, not the
 * writing.
 *
 * The source material is deliberately his own history rather than the
 * internet: what already worked on his account, judged by his own rules,
 * is a better guide than what works in general.
 */

export interface IdeaSuggestion {
  /** The idea, said the way he would say it out loud. */
  title: string;
  /** The angle: who it is for, and what makes it land. Becomes the note. */
  note: string;
  /**
   * Where this came from and what the lesson was: one of his own posts,
   * or a saved reference post and the mechanism taken from it.
   */
  because: string;
}

/** The lanes. Anything outside them is not his account. */
export const LANES = ["sales", "mindset", "personal brand", "recruiting"] as const;

export const SUGGEST_SYSTEM = `
You are proposing new content ideas for a creator, by reading what has
already worked on their own account.

WHAT YOU ARE GIVEN
Two things.

First, a table of THEIR OWN best performing posts. These were chosen by
send rate, which is sends divided by the people reached, then by overall
engagement rate. They are NOT the most viewed posts, on purpose: a post
two thousand people watched and nobody passed on taught less than a
quiet one that ten people sent to a friend.

Second, posts they saved from OTHER CREATORS, sometimes with a breakdown
of why that post worked. These are reference, not raw material.

HOW TO USE SOMEONE ELSE'S POST
Take the mechanism, never the content. The mechanism is the thing that
would still work if every noun changed: a comparison that reframes a
choice, a comment-to-get-it offer, a number that lands because it is
smaller than expected, an admission that buys permission to sell.

So from "middle class upgrades the lifestyle, millionaire upgrades the
cash flow", the transferable thing is the two-way comparison that makes
the reader place themselves, not anything about money.

Hard lines on this:
- Never reuse their words, their examples or their story.
- Never propose something that implies he did what they did.
- Their post being in a lane he does not post in is not a reason to skip
  it. Several of these are lending posts and lending is closed to him.
  Take the mechanism into one of HIS lanes instead.
- If a reference post has no transferable mechanism, ignore it. Padding
  the batch with weak ideas to use every source is worse than using one.

WHAT TO LOOK FOR
Find what the winners have in common, then propose ideas that have the
same quality for a different subject. The pattern is rarely the topic. It
is usually something underneath it: a specific admission, a number that
reframes something, a belief named out loud that the reader already
half-held, a moment that could only have happened to this person.

If a post won because it was personal, the lesson is not "post more about
that topic", it is "be that specific again".

THE LANES
Every idea must sit in one of these: ${LANES.join(", ")}. Anything else is
not this account. In particular, never propose lending, mortgage or loan
content.

WHAT AN IDEA IS
A thought, caught before it is a script, in their voice. Second person
where it points at a memory of theirs ("the first listing you lost"),
first person only where the thought itself is the content and needs no
remembered detail. One or two sentences. Not a title, not a topic, not a headline
with a colon in it, and never a format: "a carousel about X" is not an
idea, X is. They decide the format afterwards.

NEVER INVENT THEIR LIFE
This is the one that matters. You are proposing what to talk about, not
remembering it for them. If an idea needs a specific moment from their
life that you have not been told about, point at the moment and let them
fill it in. Do not supply the details.

  Write:   the call you almost didn't make
  Not:     the call I almost didn't make at 2am, when I froze for two
           seconds before I picked up

The second one reads like a memory and is not one. They would be posting
a thing that did not happen, under their own name and licence, which is
a different kind of mistake from a dull post.

So: no invented times, places, numbers, quotes, clients, conversations
or feelings. Name the kind of moment and ask them for it. Where you are
drawing on something that IS in front of you, a caption from one of
their own posts, you may use it, because they wrote it.

RULES
- Propose ideas they could film or write THIS WEEK from their own life
  and work. No research projects, no "interview an expert".
- Each one must be clearly different from the others. Eight angles on one
  thought is one idea, not eight.
- Do not repeat an idea they have already posted. The captions you are
  given are posts that already exist.
- Specific beats clever. "The call I almost did not make" beats "the
  power of persistence".
- No emoji.
`.trim();

/** The table of winners, as the prompt sees it. */
export function winnersTable(posts: WinningPost[]): string {
  if (posts.length === 0) return "No posts with enough reach to judge yet.";
  const pct = (v: number | null) => (v == null ? "-" : `${(v * 100).toFixed(1)}%`);
  const rows = posts.map((p, i) => {
    const caption = (p.caption ?? "").replace(/\s+/g, " ").trim().slice(0, 400);
    return [
      `${i + 1}. ${p.happened_on}  reached ${p.denom}`,
      `   sent ${pct(p.send_rate)}  liked ${pct(p.like_rate)}  engaged ${pct(p.engagement_rate)}${
        p.watch_rate == null ? "" : `  watched ${pct(p.watch_rate)}`
      }`,
      `   ${caption}`,
    ].join("\n");
  });
  return rows.join("\n\n");
}

/** The saved reference posts, as the prompt sees them. */
export function referenceTable(refs: ReferenceMaterial[]): string {
  if (refs.length === 0) return "";
  return refs
    .map((r, i) => {
      const caption = (r.caption ?? "").replace(/\s+/g, " ").trim().slice(0, 400);
      const why = (r.breakdown ?? "").replace(/\s+/g, " ").trim().slice(0, 600);
      return [
        `${i + 1}. @${r.handle}  ${r.happened_on}`,
        `   ${caption}`,
        why ? `   why it worked: ${why}` : "   (not broken down yet)",
      ].join("\n");
    })
    .join("\n\n");
}

export function suggestUserPrompt(
  posts: WinningPost[],
  count: number,
  refs: ReferenceMaterial[] = [],
): string {
  const refSection = refs.length
    ? `\n\nPosts they saved from other creators. Mechanism only, never the words or the story:\n\n${referenceTable(refs)}`
    : "";
  return `
Their best posts, best first:

${winnersTable(posts)}${refSection}

Propose ${count} new ideas.
`.trim();
}

export function suggestShape(count: number): string {
  return `{"ideas":[{"title":"the idea, first person, one or two sentences","note":"who it is for and what makes it land","because":"which post above this came from, their own or a saved one, and what the lesson was"}]} with exactly ${count} entries`;
}

/**
 * Keeps only what is usable.
 *
 * A suggestion with no title is nothing, and one that came back as a
 * format request rather than an idea is worse than nothing, because it
 * looks fine until he presses a format button and gets a carousel about
 * making carousels.
 */
export function normalizeSuggestions(raw: unknown): IdeaSuggestion[] {
  const list = (raw as { ideas?: unknown })?.ideas;
  if (!Array.isArray(list)) return [];
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const seen = new Set<string>();
  const out: IdeaSuggestion[] = [];

  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const title = str(r.title);
    if (!title) continue;
    if (/^(a|an)\s+(reel|carousel|story|short|email|blog post|thread)\b/i.test(title)) continue;
    const key = title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title: title.slice(0, 500), note: str(r.note), because: str(r.because) });
  }
  return out;
}
