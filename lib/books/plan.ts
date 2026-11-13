/**
 * Working out what moves where, before anything is written down.
 *
 * Rearranging an outline is the one part of this module that can lose
 * work. Two things make it dangerous: there is a unique index on
 * (book_id, position), so a half-finished shuffle is refused by the
 * database rather than tolerated, and re-outlining a book he has already
 * started writing must not delete the chapters he wrote.
 *
 * Both are decided here, as plain data, so they can be proved rather
 * than hoped for. The query layer's only job is to carry the plan out in
 * the order given.
 */

export interface ExistingChapter {
  id: number;
  position: number;
  /** Any prose at all. A chapter with prose is work and is never deleted. */
  written: boolean;
}

export interface OutlinePlan {
  /** Chapters to remove: outlined, never written. */
  deleteIds: number[];
  /**
   * Position changes for the chapters that survive, in the order they
   * must be applied. Written chapters keep their relative order and move
   * to the front.
   *
   * Every surviving chapter is first parked on a negative position and
   * then placed. Parking is not belt and braces: moving chapter 5 to 2
   * while a chapter already sits at 2 is refused outright, and the order
   * a shuffle happens to be applied in decides whether it collides, so
   * the only safe plan is one that empties the range first.
   */
  moves: { id: number; position: number }[];
  /** New chapters, appended after everything kept. */
  inserts: { position: number; index: number }[];
}

export function planOutline(
  existing: ExistingChapter[],
  incomingCount: number,
): OutlinePlan {
  const written = existing
    .filter((c) => c.written)
    .slice()
    .sort((a, b) => a.position - b.position);
  const deleteIds = existing.filter((c) => !c.written).map((c) => c.id);

  const moves: { id: number; position: number }[] = [];
  // Park first, every one of them, then place. Doing it in two passes is
  // what makes the plan safe whatever the starting positions were.
  written.forEach((c, i) => moves.push({ id: c.id, position: -(i + 1) }));
  written.forEach((c, i) => moves.push({ id: c.id, position: i + 1 }));

  const inserts: { position: number; index: number }[] = [];
  for (let i = 0; i < incomingCount; i++) {
    inserts.push({ position: written.length + i + 1, index: i });
  }

  return { deleteIds, moves, inserts };
}

/**
 * Swapping a chapter with the neighbour above or below it.
 *
 * Returns the three updates in the order they must be applied, or an
 * empty list when there is nothing to swap with. Parking again, for the
 * same reason: the two chapters are trading positions that both already
 * exist.
 */
export function planSwap(
  chapters: { id: number; position: number }[],
  chapterId: number,
  direction: "up" | "down",
): { id: number; position: number }[] {
  const sorted = chapters.slice().sort((a, b) => a.position - b.position);
  const i = sorted.findIndex((c) => c.id === chapterId);
  if (i === -1) return [];
  const j = direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= sorted.length) return [];

  const me = sorted[i];
  const them = sorted[j];
  return [
    { id: me.id, position: -1 },
    { id: them.id, position: me.position },
    { id: me.id, position: them.position },
  ];
}

/**
 * Whether a finished arrangement is one the database would accept.
 *
 * Used by the test rather than by the app: the app relies on the unique
 * index, which is the only place that can be authoritative. Having it
 * written down as a function is what lets a test check every
 * intermediate state of a shuffle, not just the end of it.
 */
export function positionsAreValid(positions: number[]): boolean {
  if (positions.some((p) => !Number.isInteger(p))) return false;
  return new Set(positions).size === positions.length;
}
