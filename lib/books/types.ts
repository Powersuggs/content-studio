/**
 * The shapes a book is made of.
 *
 * Split out from the queries because the chapter list is a client
 * component and importing a type from the queries file drags
 * currentAccountId, and with it next/headers, into the browser bundle.
 * The build refuses that, correctly.
 */

export const BOOK_STATUSES = ["outlining", "writing", "done"] as const;
export type BookStatus = (typeof BOOK_STATUSES)[number];

export const CHAPTER_STATUSES = ["outlined", "drafted", "done"] as const;
export type ChapterStatus = (typeof CHAPTER_STATUSES)[number];

export interface Book {
  id: number;
  title: string;
  subtitle: string | null;
  premise: string | null;
  audience: string | null;
  status: BookStatus;
  created_at: string;
  updated_at: string;
  /** Filled in by the list query, so a book can be read at a glance. */
  chapters?: number;
  drafted?: number;
  words?: number;
}

export interface Chapter {
  id: number;
  book_id: number;
  position: number;
  title: string;
  summary: string | null;
  body: string | null;
  status: ChapterStatus;
  updated_at: string;
}

/**
 * Counting words the way a writer means it.
 *
 * Markdown headings and list markers are not words he wrote, and a
 * chapter count that includes them flatters the progress bar. Cheap, and
 * pure, so it runs on the server for a list and in the browser while he
 * types without two different answers.
 */
export function countWords(markdown: string | null | undefined): number {
  if (!markdown) return 0;
  return markdown
    .replace(/^#+\s+/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/[*_`]/g, "")
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}
