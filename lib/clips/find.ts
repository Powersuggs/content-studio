/**
 * Finding the moments in a long take that stand on their own.
 *
 * The model picks them, and then everything it picked is checked here
 * against the transcript it was given. That order matters: a model asked
 * for timestamps will cheerfully return a clip that starts after the
 * video ends, two clips that overlap by nine seconds, or a clip of four
 * seconds. None of those is visible until he presses cut, at which point
 * the cutter produces something broken and the app looks at fault.
 *
 * So this module's real job is the checking, not the asking. All of it
 * is pure and exported.
 */

/**
 * A sentence the transcriber heard, and when it was said.
 *
 * Declared here rather than beside the Groq call because everything that
 * reasons about clips needs it and nothing that reasons about clips
 * should have to import the network code to get it.
 */
export interface TimedSegment {
  /** Seconds from the start of the recording. */
  start: number;
  end: number;
  text: string;
}

export interface Clip {
  start: number;
  end: number;
  /** His own words at the start of it, so the list is recognisable. */
  opening: string;
  /** One line on why this one works, in plain words. */
  why: string;
}

/** A clip shorter than this is not a clip, it is a moment. */
export const MIN_CLIP_SECONDS = 12;
/** Past this it is not a clip either, it is the video again. */
export const MAX_CLIP_SECONDS = 90;

export const FIND_SYSTEM = `You are reading a timed transcript of someone talking to camera, and picking the parts that would work on their own as a short vertical video.

WHAT MAKES A CLIP
- It opens on something that makes a stranger stop. A claim, a number, a mistake, a flat contradiction of what people assume.
- It pays that off inside the clip. A clip that sets up a point and does not land it is the worst kind, because it reads as bait.
- It needs no context from the rest of the recording. If it only makes sense after something said earlier, it is not a clip.
- It ends on the last word that matters, not on a trailing "so yeah" or "anyway".

RULES
- Between 2 and 6 clips. A long take rarely holds more than that and padding the list makes the good ones harder to find.
- 12 to 90 seconds each. Prefer 20 to 45.
- Clips must not overlap. If two good moments share a sentence, pick the better one.
- Start and end on the times given in the transcript. Do not invent a time that is not a segment boundary.
- Use his own words for the opening field: quote the first few words of the clip exactly as the transcript has them.
- Say plainly why each works. "Opens on the agent who took home less after moving up a split" is useful. "Engaging hook with strong value" is not.
- If nothing in here stands alone, return an empty list. An honest empty answer beats four clips that will not land.`;

export const FIND_SHAPE = `{"clips":[{"start":12.4,"end":48.9,"opening":"his first few words, quoted","why":"one plain sentence"}]}`;

export function findUserPrompt(segments: TimedSegment[]): string {
  const total = segments.at(-1)?.end ?? 0;
  return `TIMED TRANSCRIPT
The recording is ${total.toFixed(1)} seconds long. Each line is "start to end: what was said".

${segments.map((s) => `${s.start.toFixed(1)} to ${s.end.toFixed(1)}: ${s.text}`).join("\n")}`;
}

/**
 * Everything the model returned, checked against what it was given.
 *
 * Clips are snapped to real segment boundaries rather than rejected for
 * being a few tenths off, because a model that is nearly right about
 * where a sentence ends is still useful and refusing it would throw away
 * good clips. Everything else is a rejection: out of range, too short,
 * too long, or overlapping something already kept.
 */
export function validateClips(raw: unknown, segments: TimedSegment[]): Clip[] {
  if (segments.length === 0) return [];
  const starts = segments.map((s) => s.start);
  const ends = segments.map((s) => s.end);

  const row = (raw ?? {}) as Record<string, unknown>;
  const list = Array.isArray(row.clips) ? row.clips : [];

  const kept: Clip[] = [];
  for (const item of list) {
    const c = (item ?? {}) as Record<string, unknown>;
    let start = Number(c.start);
    let end = Number(c.end);
    // A guard, not the thing that rejects these: NaN and Infinity both
    // fall out of the snapping below as well. It stays because relying
    // on that is not obvious to the next person reading it.
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;

    // Snapped to a real boundary, which is also what keeps a clip inside
    // the recording: every candidate becomes a time the transcriber
    // actually reported, so a start of 300 in a two minute take lands on
    // the last boundary and then fails the length check below. An
    // explicit clamp here would never fire, and dead defensive code
    // implies a protection that is not doing anything.
    start = nearest(starts, start);
    end = nearest(ends, end);
    if (!(end > start)) continue;

    const length = end - start;
    if (length < MIN_CLIP_SECONDS || length > MAX_CLIP_SECONDS) continue;

    // Overlap is checked against what has already been kept, so the
    // earlier clip in the model's own ordering wins. It put its best
    // first often enough that this beats picking by length.
    if (kept.some((k) => start < k.end && end > k.start)) continue;

    kept.push({
      start,
      end,
      opening: String(c.opening ?? "").trim().slice(0, 200) || openingFrom(segments, start),
      why: String(c.why ?? "").trim().slice(0, 300),
    });
    if (kept.length >= 6) break;
  }

  return kept.sort((a, b) => a.start - b.start);
}

/** The closest value in a sorted list. Ties go to the earlier one. */
export function nearest(values: number[], to: number): number {
  let best = values[0];
  let bestGap = Math.abs(values[0] - to);
  for (const v of values) {
    const gap = Math.abs(v - to);
    if (gap < bestGap) {
      best = v;
      bestGap = gap;
    }
  }
  return best;
}

/** What was actually said at that moment, when the model gave no opening. */
export function openingFrom(segments: TimedSegment[], start: number): string {
  const at = segments.find((s) => s.start >= start) ?? segments[0];
  return at.text.slice(0, 120);
}

/**
 * Segments made safe to work from.
 *
 * Pure and exported: everything downstream trusts that these are sorted,
 * non-empty, and have an end after their start, and an upstream that
 * breaks any of those would otherwise produce clips with negative length
 * that look fine until they are cut.
 */
export function normalizeSegments(
  raw: { start?: number; end?: number; text?: string }[] | undefined,
): TimedSegment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s) => ({
      start: Number(s?.start),
      end: Number(s?.end),
      text: String(s?.text ?? "").trim(),
    }))
    .filter(
      (s) =>
        Number.isFinite(s.start) &&
        Number.isFinite(s.end) &&
        s.start >= 0 &&
        s.end > s.start &&
        s.text !== "",
    )
    .sort((a, b) => a.start - b.start);
}
