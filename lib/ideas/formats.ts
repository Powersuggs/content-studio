/**
 * The formats one idea can turn into.
 *
 * The pipeline's whole job is showing what has NOT been made yet, so this
 * list is what "not yet" is measured against. Keep it short: a list of
 * twenty formats makes every idea look permanently unfinished, which is
 * discouraging rather than useful.
 */

export type FormatId =
  | "reel"
  | "carousel"
  | "story"
  | "short"
  | "email"
  | "blog"
  | "thread";

export interface Format {
  id: FormatId;
  label: string;
  /** One line on what this format is for, shown when picking. */
  hint: string;
}

export const FORMATS: Format[] = [
  { id: "reel", label: "Reel", hint: "Short vertical video, the main one" },
  { id: "carousel", label: "Carousel", hint: "Multi-slide post people swipe" },
  { id: "story", label: "Story", hint: "Quick, casual, 24 hours" },
  { id: "short", label: "Short", hint: "YouTube Short or TikTok cut" },
  { id: "email", label: "Email", hint: "To your list" },
  { id: "blog", label: "Blog post", hint: "Long form, for search" },
  { id: "thread", label: "Thread", hint: "Text post broken into parts" },
];

const BY_ID = new Map(FORMATS.map((f) => [f.id, f]));

export function getFormat(id: string): Format | undefined {
  return BY_ID.get(id as FormatId);
}

export function isFormatId(id: string): id is FormatId {
  return BY_ID.has(id as FormatId);
}

export function formatLabel(id: string): string {
  return getFormat(id)?.label ?? id;
}
