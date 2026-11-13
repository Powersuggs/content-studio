import { query, queryOne } from "@/lib/db";
import { currentAccountId } from "@/lib/auth/current-account";
import { countWords as countWordsOf } from "./types";
import { planOutline, planSwap } from "./plan";
import type { Book, BookStatus, Chapter, ChapterStatus } from "./types";

export type { Book, BookStatus, Chapter, ChapterStatus } from "./types";
export { BOOK_STATUSES, CHAPTER_STATUSES, countWords } from "./types";

export async function listBooks(): Promise<Book[]> {
  const account = await currentAccountId();
  const books = await query<Book>(
    `select id, title, subtitle, premise, audience, status, created_at, updated_at
       from books where account_id = $1 order by updated_at desc`,
    [account],
  );
  if (books.length === 0) return books;

  // Counted in JavaScript with countWords rather than in SQL. A word
  // count done two ways gives two answers, and the number on the list
  // would then disagree with the number on the chapter he is editing,
  // which is the kind of small wrongness that makes a tool feel untrustworthy.
  const rows = await query<{ book_id: string; body: string | null }>(
    `select book_id, body from book_chapters where account_id = $1`,
    [account],
  );
  const tally = new Map<number, { chapters: number; drafted: number; words: number }>();
  for (const r of rows) {
    const id = Number(r.book_id);
    const t = tally.get(id) ?? { chapters: 0, drafted: 0, words: 0 };
    t.chapters += 1;
    const words = countWordsOf(r.body);
    if (words > 0) {
      t.drafted += 1;
      t.words += words;
    }
    tally.set(id, t);
  }
  return books.map((b) => ({
    ...b,
    ...(tally.get(Number(b.id)) ?? { chapters: 0, drafted: 0, words: 0 }),
  }));
}

export async function getBook(bookId: number): Promise<Book | null> {
  const account = await currentAccountId();
  const row = await queryOne<Book>(
    `select id, title, subtitle, premise, audience, status, created_at, updated_at
       from books where id = $1 and account_id = $2`,
    [bookId, account],
  );
  return row ?? null;
}

export async function getChapters(bookId: number): Promise<Chapter[]> {
  const account = await currentAccountId();
  return query<Chapter>(
    `select id, book_id, position, title, summary, body, status, updated_at
       from book_chapters
      where book_id = $1 and account_id = $2
      order by position`,
    [bookId, account],
  );
}

export async function createBook(input: {
  title: string;
  subtitle?: string | null;
  premise?: string | null;
  audience?: string | null;
}): Promise<number> {
  const account = await currentAccountId();
  const title = input.title.trim();
  if (!title) throw new Error("A book needs a title.");
  const row = await queryOne<{ id: string }>(
    `insert into books (account_id, title, subtitle, premise, audience)
     values ($1, $2, $3, $4, $5) returning id`,
    [
      account,
      title.slice(0, 300),
      input.subtitle?.trim() || null,
      input.premise?.trim() || null,
      input.audience?.trim() || null,
    ],
  );
  return Number(row!.id);
}

export async function updateBook(
  bookId: number,
  input: {
    title?: string;
    subtitle?: string | null;
    premise?: string | null;
    audience?: string | null;
    status?: BookStatus;
  },
): Promise<void> {
  const account = await currentAccountId();
  await query(
    `update books set
       title = coalesce($1, title),
       subtitle = coalesce($2, subtitle),
       premise = coalesce($3, premise),
       audience = coalesce($4, audience),
       status = coalesce($5, status),
       updated_at = now()
     where id = $6 and account_id = $7`,
    [
      input.title?.trim() || null,
      input.subtitle?.trim() ?? null,
      input.premise?.trim() ?? null,
      input.audience?.trim() ?? null,
      input.status ?? null,
      bookId,
      account,
    ],
  );
}

export async function deleteBook(bookId: number): Promise<void> {
  const account = await currentAccountId();
  await query(`delete from books where id = $1 and account_id = $2`, [bookId, account]);
}

/**
 * Replace the outline, keeping any chapter that already has prose.
 *
 * This is the one genuinely dangerous operation in the module: pressing
 * "outline it" a second time, after drafting four chapters, must not
 * delete four chapters of writing. So drafted chapters are kept and the
 * new outline is appended after them. The alternative, refusing to
 * re-outline at all, makes the button a trap in the other direction.
 */
export async function replaceOutline(
  bookId: number,
  chapters: { title: string; summary: string }[],
): Promise<{ added: number; kept: number }> {
  const account = await currentAccountId();
  const existing = await getChapters(bookId);

  const plan = planOutline(
    existing.map((c) => ({
      id: Number(c.id),
      position: c.position,
      written: (c.body ?? "").trim() !== "",
    })),
    chapters.length,
  );

  if (plan.deleteIds.length > 0) {
    await query(
      `delete from book_chapters where account_id = $1 and id = any($2::bigint[])`,
      [account, plan.deleteIds],
    );
  }
  for (const move of plan.moves) {
    await query(
      `update book_chapters set position = $1 where id = $2 and account_id = $3`,
      [move.position, move.id, account],
    );
  }
  for (const ins of plan.inserts) {
    const c = chapters[ins.index];
    await query(
      `insert into book_chapters (account_id, book_id, position, title, summary)
       values ($1, $2, $3, $4, $5)`,
      [account, bookId, ins.position, c.title.slice(0, 300), c.summary || null],
    );
  }
  await query(`update books set updated_at = now() where id = $1 and account_id = $2`, [
    bookId,
    account,
  ]);
  return { added: plan.inserts.length, kept: plan.moves.length / 2 };
}

export async function addChapter(
  bookId: number,
  title: string,
  summary?: string | null,
): Promise<number> {
  const account = await currentAccountId();
  const clean = title.trim();
  if (!clean) throw new Error("A chapter needs a title.");
  const row = await queryOne<{ id: string }>(
    `insert into book_chapters (account_id, book_id, position, title, summary)
     values ($1, $2,
       coalesce((select max(position) from book_chapters where book_id = $2), 0) + 1,
       $3, $4)
     returning id`,
    [account, bookId, clean.slice(0, 300), summary?.trim() || null],
  );
  return Number(row!.id);
}

export async function getChapterForDrafting(
  chapterId: number,
): Promise<{ chapter: Chapter; book: Book; outline: Chapter[] } | null> {
  const account = await currentAccountId();
  const chapter = await queryOne<Chapter>(
    `select id, book_id, position, title, summary, body, status, updated_at
       from book_chapters where id = $1 and account_id = $2`,
    [chapterId, account],
  );
  if (!chapter) return null;
  const book = await getBook(Number(chapter.book_id));
  if (!book) return null;
  return {
    chapter: { ...chapter, book_id: Number(chapter.book_id) },
    book,
    outline: await getChapters(Number(chapter.book_id)),
  };
}

export async function saveChapterBody(
  chapterId: number,
  body: string,
): Promise<void> {
  const account = await currentAccountId();
  await query(
    `update book_chapters
        set body = $1,
            status = case when status = 'outlined' then 'drafted' else status end,
            updated_at = now()
      where id = $2 and account_id = $3`,
    [body, chapterId, account],
  );
}

export async function updateChapter(
  chapterId: number,
  input: { title?: string; summary?: string | null; status?: ChapterStatus },
): Promise<void> {
  const account = await currentAccountId();
  await query(
    `update book_chapters set
       title = coalesce($1, title),
       summary = coalesce($2, summary),
       status = coalesce($3, status),
       updated_at = now()
     where id = $4 and account_id = $5`,
    [
      input.title?.trim() || null,
      input.summary?.trim() ?? null,
      input.status ?? null,
      chapterId,
      account,
    ],
  );
}

export async function deleteChapter(chapterId: number): Promise<void> {
  const account = await currentAccountId();
  await query(`delete from book_chapters where id = $1 and account_id = $2`, [
    chapterId,
    account,
  ]);
}

/**
 * Swap a chapter with its neighbour.
 *
 * Two rows change and the unique index on (book_id, position) would
 * refuse the halfway state, so the first one is parked on a negative
 * number that no real chapter can hold.
 */
export async function moveChapter(
  chapterId: number,
  direction: "up" | "down",
): Promise<void> {
  const account = await currentAccountId();
  const me = await queryOne<{ book_id: string }>(
    `select book_id from book_chapters where id = $1 and account_id = $2`,
    [chapterId, account],
  );
  if (!me) return;

  const siblings = await query<{ id: string; position: number }>(
    `select id, position from book_chapters
      where book_id = $1 and account_id = $2 order by position`,
    [me.book_id, account],
  );

  for (const step of planSwap(
    siblings.map((c) => ({ id: Number(c.id), position: c.position })),
    chapterId,
    direction,
  )) {
    await query(
      `update book_chapters set position = $1 where id = $2 and account_id = $3`,
      [step.position, step.id, account],
    );
  }
}

/**
 * His own words, for the model to draft from.
 *
 * Three sources, in the order they are worth reading: takes he talked
 * through (his actual speech), posts that reached people (what works),
 * and the facts he has verified (handled separately by the guardrail, so
 * not repeated here). Capped, because a prompt with four hundred
 * captions in it costs money and tells the model less, not more.
 */
export async function getOwnMaterial(limit = 25): Promise<string[]> {
  const account = await currentAccountId();
  const talks = await query<{ title: string; transcript: string }>(
    `select title, transcript from ideas
      where account_id = $1 and coalesce(transcript, '') <> ''
      order by created_at desc limit $2`,
    [account, Math.ceil(limit / 2)],
  );
  const posts = await query<{ caption: string }>(
    `select caption from posts
      where account_id = $1 and platform = 'instagram'
        and coalesce(caption, '') <> ''
      order by coalesce(views, 0) desc limit $2`,
    [account, Math.floor(limit / 2)],
  );
  return [
    ...talks.map((t) => `He said, on "${t.title}": ${oneLine(t.transcript, 1200)}`),
    ...posts.map((p) => `From a post of his: ${oneLine(p.caption, 400)}`),
  ];
}

/** Flattened and capped, so one long take cannot crowd out the rest. */
function oneLine(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max).trimEnd()}...`;
}
