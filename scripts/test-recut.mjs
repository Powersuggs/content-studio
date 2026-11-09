#!/usr/bin/env node
/**
 * The cutting arithmetic behind the editing room.
 *
 * Aaron asked for what Amplifii does: the video on screen with the sound
 * waves under it and the quiet spots cut out. The part that decides WHERE
 * the quiet is, and what is left afterwards, is all numbers, so it gets
 * checked here instead of by filming something and watching it back.
 *
 * The cases that matter are the destructive ones. A gap detector that is
 * slightly too keen eats the start of words. A keep-range builder that
 * mishandles overlapping cuts produces a video with a chunk missing from
 * the middle and no warning. Neither is visible until after it is posted.
 *
 *   node scripts/test-recut.mjs
 */
import {
  findQuietSpans,
  keepRanges,
  keptSeconds,
  loudnessProfile,
  peakOf,
  sourceTimeAt,
  QUIET_DEFAULTS,
} from "../lib/session/recut.ts";

let passed = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) { passed++; console.log(`  PASS  ${label}`); }
  else { failures.push(label); console.log(`  FAIL  ${label}${detail ? `\n          ${detail}` : ""}`); }
}
const near = (a, b, tol = 0.02) => Math.abs(a - b) <= tol;

const SPS = 50; // slices per second, matching the default profile

/** Build a loudness profile: [seconds, level] pairs, in order. */
function profile(parts) {
  const out = [];
  for (const [seconds, level] of parts) {
    for (let i = 0; i < Math.round(seconds * SPS); i++) out.push(level);
  }
  return out;
}

console.log("\nCutting the quiet parts\n");

console.log("  Finding the gaps");
{
  // Talk 3s, silent 2s, talk 3s. One gap, in the middle.
  const spans = findQuietSpans(profile([[3, 0.5], [2, 0.001], [3, 0.5]]), SPS);
  check("one clear gap is found", spans.length === 1, `found ${spans.length}`);
  if (spans.length === 1) {
    check(
      "...starting just after the talking stops, not on top of it",
      near(spans[0].start, 3 + QUIET_DEFAULTS.padding),
      `starts at ${spans[0].start?.toFixed(3)}, expected ${(3 + QUIET_DEFAULTS.padding).toFixed(3)}`,
    );
    check(
      "...and ending just before it starts again",
      near(spans[0].end, 5 - QUIET_DEFAULTS.padding),
      `ends at ${spans[0].end?.toFixed(3)}, expected ${(5 - QUIET_DEFAULTS.padding).toFixed(3)}`,
    );
  }
}
{
  // Breathing between sentences: a fifth of a second. Must survive.
  const spans = findQuietSpans(profile([[2, 0.5], [0.2, 0.001], [2, 0.5]]), SPS);
  check(
    "a short breath between sentences is NOT cut",
    spans.length === 0,
    `cut ${spans.length} gap(s); this is what makes an edit sound like a machine`,
  );
}
{
  // A quiet speaker. Everything scaled down by 20x: the gaps are still
  // gaps relative to his own voice.
  const spans = findQuietSpans(profile([[2, 0.025], [1, 0.00005], [2, 0.025]]), SPS);
  check(
    "a quietly recorded take still has its gap found",
    spans.length === 1,
    `found ${spans.length}; a fixed threshold would miss this entirely`,
  );
  // Counting the gaps is not enough. A threshold that is absolute rather
  // than relative to this take calls the whole recording quiet, which is
  // also "one span", and would offer to delete the lot. Check WHERE it is.
  check(
    "...in the middle, not swallowing his quiet voice either side of it",
    spans.length === 1 && near(spans[0].start, 2 + QUIET_DEFAULTS.padding) &&
      near(spans[0].end, 3 - QUIET_DEFAULTS.padding),
    `gap is ${spans[0]?.start?.toFixed(2)} to ${spans[0]?.end?.toFixed(2)}, expected about 2.08 to 2.92`,
  );
}
{
  // Loud room tone under the talking. The floor is high but the gaps are
  // still much quieter than the voice.
  const spans = findQuietSpans(profile([[2, 0.6], [1.5, 0.03], [2, 0.6]]), SPS);
  check("a noisy room does not hide the gap", spans.length === 1, `found ${spans.length}`);
}
{
  const spans = findQuietSpans(profile([[5, 0]]), SPS);
  check(
    "a take with no sound at all offers no cuts, rather than offering to delete everything",
    spans.length === 0,
    `offered to cut ${spans.length} span(s) of a silent take`,
  );
}
{
  const spans = findQuietSpans(profile([[4, 0.5]]), SPS);
  check("a take with no gaps offers no cuts", spans.length === 0);
}

console.log("\n  What is left after cutting");
{
  const keep = keepRanges(10, [{ start: 3, end: 5 }]);
  check("a cut in the middle leaves two pieces", keep.length === 2, JSON.stringify(keep));
  check("...the first running up to the cut", near(keep[0]?.end, 3));
  check("...the second starting after it", near(keep[1]?.start, 5));
  check("...and the total is the take minus the cut", near(keptSeconds(keep), 8));
}
{
  // The dangerous case: overlapping cuts. Handled wrong this silently
  // removes more than asked.
  const keep = keepRanges(10, [{ start: 2, end: 5 }, { start: 4, end: 6 }]);
  check(
    "overlapping cuts are merged, not applied twice",
    near(keptSeconds(keep), 6),
    `kept ${keptSeconds(keep).toFixed(2)}s, expected 6s (10 minus 2 to 6)`,
  );
}
{
  const keep = keepRanges(10, [{ start: 6, end: 8 }, { start: 1, end: 2 }]);
  check(
    "cuts given out of order still come back in order",
    keep.every((r, i) => i === 0 || r.start >= keep[i - 1].end),
    JSON.stringify(keep),
  );
  check("...and remove the right amount", near(keptSeconds(keep), 7));
}
{
  const keep = keepRanges(10, [{ start: 0, end: 10 }]);
  check("cutting everything leaves nothing, without going negative", keep.length === 0);
}
{
  const keep = keepRanges(10, [], 1, 2);
  check("trimming the ends works with no cuts at all", near(keptSeconds(keep), 7), JSON.stringify(keep));
  check("...starting where the trim says", near(keep[0]?.start, 1));
  check("...ending where the trim says", near(keep[0]?.end, 8));
}
{
  const keep = keepRanges(10, [{ start: 0, end: 4 }], 2, 0);
  check(
    "a cut overlapping the trimmed-off head does not double-count",
    near(keptSeconds(keep), 6),
    `kept ${keptSeconds(keep).toFixed(2)}s, expected 6s`,
  );
}
{
  const keep = keepRanges(10, [], 7, 7);
  check("trims that cross over leave nothing rather than a negative range", keep.length === 0);
}
{
  const keep = keepRanges(10, [{ start: 4.99, end: 5.0 }]);
  check(
    "a cut too short to matter does not leave a stuttering sliver behind",
    keep.length <= 2 && near(keptSeconds(keep), 9.99, 0.05),
    JSON.stringify(keep),
  );
}

console.log("\n  Following along during the export");
{
  const keep = keepRanges(10, [{ start: 3, end: 5 }]);
  check("the start of the edit is the start of the take", near(sourceTimeAt(keep, 0), 0));
  check("a moment before the cut maps straight through", near(sourceTimeAt(keep, 2), 2));
  check(
    "a moment after the cut maps past it",
    near(sourceTimeAt(keep, 3.5), 5.5),
    `got ${sourceTimeAt(keep, 3.5)}, expected 5.5`,
  );
  check("past the end there is nothing left to play", sourceTimeAt(keep, 99) === null);
}

console.log("\n  Measuring loudness from samples");
{
  const rate = 1000;
  const samples = new Float32Array(rate * 2);
  for (let i = 0; i < rate; i++) samples[i] = Math.sin(i) * 0.5;
  const prof = loudnessProfile(samples, rate, SPS);
  check("a profile has one value per slice", prof.length === 100, `got ${prof.length}`);
  check("the loud half reads loud", peakOf(prof.slice(0, 50)) > 0.2);
  check("the silent half reads silent", peakOf(prof.slice(50)) === 0);
  check(
    "a single click does not make a silent stretch look loud",
    (() => {
      const s = new Float32Array(rate);
      s[10] = 1;
      return peakOf(loudnessProfile(s, rate, SPS)) < 0.3;
    })(),
    "root mean square should flatten one spike across its slice",
  );
}

console.log(
  failures.length === 0
    ? `\nAll ${passed} checks passed.\n`
    : `\n${failures.length} FAILURE(S), ${passed} passed.\n`,
);
process.exit(failures.length === 0 ? 0 : 1);
