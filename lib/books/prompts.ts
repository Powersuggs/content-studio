import type { Chapter } from "./types";

/**
 * What the model is told when it outlines a book, and when it drafts a
 * chapter of one.
 *
 * The reason to write a book inside this app rather than in a blank
 * document is that this app knows how he sounds and what he has actually
 * said. So both prompts are built the same way as the talk prompt: his
 * own material goes in as the source, with explicit instruction not to
 * replace his specifics with general ones, because that substitution is
 * the default behaviour and it is what makes a drafted chapter read like
 * nobody wrote it.
 *
 * Everything here is pure and exported, so what reaches the model can be
 * asserted in a test without a network call.
 */

export const OUTLINE_SYSTEM = `You are outlining a non-fiction book for someone who already has an audience and a body of work.

WHAT AN OUTLINE IS FOR
Each chapter is a promise to the reader. The outline's job is to show that the promises add up to the premise and that they are in an order a reader can follow.

RULES
- 8 to 14 chapters. Fewer and each one is a book; more and he will not finish it.
- Every chapter earns its place by doing something the others do not. If two chapters would say the same thing with different examples, they are one chapter.
- Order by what the reader needs to believe first, not by what is easiest to write.
- The summary is what the chapter DOES, in two or three sentences. Not what it covers. "Shows why the split is the least important number on the page, using the agent who moved and took home less" does; "Discusses commission structures" does not.
- Use his own material where it fits: if something below is clearly a chapter, make it one, and say in the summary which of his own examples belongs there.
- Chapter titles in his voice, not a publisher's. Plain, concrete, under 70 characters.
- Do not invent statistics, case studies or client stories. If a chapter needs evidence he has not given, say so in the summary.`;

export const OUTLINE_SHAPE = `{"chapters":[{"title":"plain and concrete","summary":"what this chapter does, two or three sentences"}]}`;

export function outlineUserPrompt(input: {
  title: string;
  subtitle?: string | null;
  premise?: string | null;
  audience?: string | null;
  material?: string[];
}): string {
  const parts = [`THE BOOK\n${input.title}${input.subtitle ? `: ${input.subtitle}` : ""}`];
  if (input.premise?.trim()) parts.push(`WHAT IT ARGUES\n${input.premise.trim()}`);
  if (input.audience?.trim()) parts.push(`WHO IT IS FOR\n${input.audience.trim()}`);

  const material = (input.material ?? []).map((m) => m.trim()).filter(Boolean);
  if (material.length > 0) {
    parts.push(
      `HIS OWN MATERIAL
Things he has already said or written. Mine these for the chapters that are already there, and for his phrasing. Do not treat them as a table of contents.

${material.map((m) => `- ${m}`).join("\n")}`,
    );
  }
  return parts.join("\n\n");
}

export const CHAPTER_SYSTEM = `You are drafting one chapter of someone's book, in their voice.

WHAT YOU ARE WRITING
Prose a person reads straight through. Not a listicle with headings over every paragraph, and not a blog post. A chapter can hold a list where a list is genuinely the clearest thing, and otherwise it is paragraphs.

RULES
- Write the chapter itself. No preamble, no "in this chapter we will", no summary at the end restating it.
- Do the job the chapter summary says it does, and stop. A chapter that also does the next chapter's job is the reason books get abandoned.
- Open on something concrete. A moment, a person, a number he has given you. Never on a definition.
- Their phrasing is the point. Where the material below says something in a way you would not have written, keep their way.
- Every specific in their material is real. Use those. Do not swap a real specific for a general one, and do not round a real number to a tidier one.
- Do not add a claim, a statistic, a study or a client story that is not in the material. If the chapter needs evidence that is not there, write the chapter without it and name what is missing in the notes.
- No emoji. No hashtags. This is a book.
- 1200 to 2200 words unless the summary plainly calls for less.

MARKDOWN
Plain markdown. A single # heading with the chapter title at the top, ## for a section break where one is needed, and nothing else. No bold runs, no horizontal rules, no tables.`;

export const CHAPTER_SHAPE = `{"body":"the chapter in markdown, starting with a single # heading","notes":"one or two lines: what was deliberately left out, or what evidence is missing"}`;

export function chapterUserPrompt(input: {
  book: { title: string; subtitle?: string | null; premise?: string | null; audience?: string | null };
  chapter: { position: number; title: string; summary?: string | null };
  /** Title and summary of every chapter, so this one does not do their job. */
  outline?: Pick<Chapter, "position" | "title" | "summary">[];
  material?: string[];
}): string {
  const { book, chapter } = input;
  const parts = [
    `THE BOOK\n${book.title}${book.subtitle ? `: ${book.subtitle}` : ""}`,
  ];
  if (book.premise?.trim()) parts.push(`WHAT IT ARGUES\n${book.premise.trim()}`);
  if (book.audience?.trim()) parts.push(`WHO IT IS FOR\n${book.audience.trim()}`);

  parts.push(
    `THE CHAPTER TO WRITE
Chapter ${chapter.position}: ${chapter.title}

What it does:
${chapter.summary?.trim() || "No summary was written. Infer it from the title and the book's premise, and say in notes what you took it to mean."}`,
  );

  const outline = (input.outline ?? []).filter((c) => c.position !== chapter.position);
  if (outline.length > 0) {
    parts.push(
      `THE REST OF THE BOOK
These are other chapters. Do not do their job, and do not set up what they already set up. Where this chapter needs something they cover, refer to it in a clause and move on.

${outline
  .slice()
  .sort((a, b) => a.position - b.position)
  .map((c) => `${c.position}. ${c.title}${c.summary ? `\n   ${c.summary}` : ""}`)
  .join("\n")}`,
    );
  }

  const material = (input.material ?? []).map((m) => m.trim()).filter(Boolean);
  if (material.length > 0) {
    parts.push(
      `HIS OWN MATERIAL
His words, and the specifics he has actually given. This is the source for anything concrete in the chapter.

${material.map((m) => `- ${m}`).join("\n")}`,
    );
  }
  return parts.join("\n\n");
}

/** What came back from an outline call, made safe to store. */
export function normalizeOutline(
  raw: unknown,
): { title: string; summary: string }[] {
  const row = (raw ?? {}) as Record<string, unknown>;
  const list = Array.isArray(row.chapters) ? row.chapters : [];
  const out: { title: string; summary: string }[] = [];
  for (const item of list) {
    const c = (item ?? {}) as Record<string, unknown>;
    const title = typeof c.title === "string" ? c.title.trim() : "";
    if (!title) continue;
    out.push({
      title: title.slice(0, 300),
      summary: (typeof c.summary === "string" ? c.summary.trim() : "").slice(0, 2000),
    });
    // A model asked for 14 has returned 40. Stored, that is an outline
    // nobody can read and a page that takes a minute to draw.
    if (out.length >= 24) break;
  }
  return out;
}

/** What came back from a chapter call, made safe to store. */
export function normalizeChapter(
  raw: unknown,
): { body: string; notes: string } | null {
  const row = (raw ?? {}) as Record<string, unknown>;
  const body = typeof row.body === "string" ? row.body.trim() : "";
  if (!body) return null;
  return {
    body,
    notes: (typeof row.notes === "string" ? row.notes.trim() : "").slice(0, 1000),
  };
}
