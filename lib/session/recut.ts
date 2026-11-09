/**
 * Working out where the quiet parts are, and what is left after cutting.
 *
 * Session Mode already drops silence while you film, by pausing the
 * recorder when the room goes quiet. That is free and lossless, but it
 * decides in the moment and you cannot argue with it afterwards. This is
 * the other half: look at a take you have already filmed, see where the
 * gaps are, and choose.
 *
 * Everything here is arithmetic over numbers. No browser, no audio, no
 * video, so it can be checked by scripts/test-recut.mjs rather than by
 * filming something and squinting at the result.
 */

/** A stretch of the take, in seconds from its start. */
export interface Span {
  start: number;
  end: number;
}

export interface QuietOptions {
  /**
   * How loud counts as quiet, as a fraction of the loudest moment in this
   * take. Relative rather than absolute because his microphone level is
   * not ours to predict: a quiet recording would have every gap missed by
   * a fixed threshold, and a loud one would have words cut out.
   */
  threshold: number;
  /**
   * The shortest gap worth cutting, in seconds. Breathing between
   * sentences is a gap too, and a video with every one of those removed
   * sounds like a machine reading a list.
   */
  minGap: number;
  /**
   * Left at each end of a gap, in seconds, so the cut never lands hard
   * against a word. Trimming to the exact first loud sample clips the
   * start of consonants, which is the difference between a tight edit and
   * one that sounds broken.
   */
  padding: number;
}

export const QUIET_DEFAULTS: QuietOptions = {
  threshold: 0.08,
  minGap: 0.45,
  padding: 0.08,
};

/**
 * The loudness of each slice of the take, 0 to 1.
 *
 * Built from the decoded audio by the caller. Kept as a plain array so
 * everything below is testable with numbers typed by hand.
 */
export type Loudness = number[];

/**
 * Reduce raw audio samples to one loudness figure per slice.
 *
 * Root mean square rather than peak, because a single click should not
 * make a silent second look loud.
 */
export function loudnessProfile(
  samples: Float32Array | number[],
  sampleRate: number,
  slicesPerSecond = 50,
): Loudness {
  const per = Math.max(1, Math.round(sampleRate / slicesPerSecond));
  const out: Loudness = [];
  for (let i = 0; i < samples.length; i += per) {
    let sum = 0;
    const end = Math.min(i + per, samples.length);
    for (let j = i; j < end; j++) sum += samples[j] * samples[j];
    out.push(Math.sqrt(sum / Math.max(1, end - i)));
  }
  return out;
}

/** The loudest slice, used to make the threshold relative to this take. */
export function peakOf(loudness: Loudness): number {
  let peak = 0;
  for (const v of loudness) if (v > peak) peak = v;
  return peak;
}

/**
 * The quiet stretches, as spans in seconds.
 *
 * Gaps shorter than minGap are left alone, and every gap returned has
 * already had the padding taken off each end, so what comes back is what
 * would actually be cut rather than what was measured.
 */
export function findQuietSpans(
  loudness: Loudness,
  slicesPerSecond: number,
  options: QuietOptions = QUIET_DEFAULTS,
): Span[] {
  const peak = peakOf(loudness);
  // A take with no sound at all: nothing to compare against, so rather
  // than treat the whole thing as one huge gap and offer to delete the
  // entire video, call it nothing to cut and let him hear it himself.
  if (peak <= 0) return [];

  const limit = peak * options.threshold;
  const spans: Span[] = [];
  let runStart: number | null = null;

  for (let i = 0; i <= loudness.length; i++) {
    const quiet = i < loudness.length && loudness[i] <= limit;
    if (quiet && runStart === null) runStart = i;
    if (!quiet && runStart !== null) {
      spans.push({ start: runStart / slicesPerSecond, end: i / slicesPerSecond });
      runStart = null;
    }
  }

  return spans
    .map((s) => ({
      start: s.start + options.padding,
      end: s.end - options.padding,
    }))
    .filter((s) => s.end - s.start >= options.minGap - options.padding * 2)
    .filter((s) => s.end > s.start);
}

/**
 * What survives: the take with the cuts taken out.
 *
 * Takes the whole duration, the spans being cut, and how much is being
 * trimmed off each end, and returns the stretches to keep in order.
 *
 * The cuts are sorted and merged before use. Sorting is load-bearing. The
 * merging is belt and braces: with the list sorted, the running position
 * below already refuses to go backwards, so overlapping cuts come out
 * right without it. Deliberately kept anyway, because the cost is six
 * lines and the failure it guards against is a chunk silently missing
 * from the middle of a finished video. Worth knowing that no test covers
 * it, because no input reaches it.
 */
export function keepRanges(
  duration: number,
  cuts: Span[],
  trimStart = 0,
  trimEnd = 0,
): Span[] {
  const from = Math.max(0, trimStart);
  const to = Math.min(duration, duration - trimEnd);
  if (!(to > from)) return [];

  const merged: Span[] = [];
  for (const cut of [...cuts].sort((a, b) => a.start - b.start)) {
    const start = Math.max(from, Math.min(cut.start, to));
    const end = Math.max(from, Math.min(cut.end, to));
    if (end <= start) continue;
    const last = merged[merged.length - 1];
    if (last && start <= last.end) last.end = Math.max(last.end, end);
    else merged.push({ start, end });
  }

  const keep: Span[] = [];
  let at = from;
  for (const cut of merged) {
    if (cut.start > at) keep.push({ start: at, end: cut.start });
    at = Math.max(at, cut.end);
  }
  if (at < to) keep.push({ start: at, end: to });

  // A range too short to hold a frame is not worth seeking for, and a
  // string of them would make the export stutter through nothing.
  return keep.filter((r) => r.end - r.start > 0.04);
}

/** How long the finished video will be. */
export function keptSeconds(ranges: Span[]): number {
  return ranges.reduce((n, r) => n + (r.end - r.start), 0);
}

/**
 * Where a moment in the finished video falls in the original.
 *
 * Needed because the export plays the original and skips the cuts, so
 * progress has to be reported against the edited length, not the
 * original, or the bar would stall at every gap.
 */
export function sourceTimeAt(ranges: Span[], editedTime: number): number | null {
  let seen = 0;
  for (const r of ranges) {
    const length = r.end - r.start;
    if (editedTime <= seen + length) return r.start + (editedTime - seen);
    seen += length;
  }
  return null;
}
