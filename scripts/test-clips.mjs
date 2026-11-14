#!/usr/bin/env node
/**
 * Clips the model suggests have to be clips the cutter can actually cut.
 *
 * A model asked for timestamps will return a clip that starts after the
 * video ends, two clips that overlap by nine seconds, a clip of four
 * seconds, and a clip of six minutes. Every one of those looks fine in a
 * list and produces something broken when he presses cut, at which point
 * the app looks at fault rather than the suggestion.
 *
 * So the asking is not what is tested here. The checking is.
 *
 *   node scripts/test-clips.mjs
 *
 * Needs esbuild to bundle the two pure modules. Skips with a note if it
 * cannot.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

let passed = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) { passed++; console.log(`  PASS  ${label}`); }
  else { failures.push(label); console.log(`  FAIL  ${label}${detail ? `\n          ${detail}` : ""}`); }
}

const dir = mkdtempSync(join(tmpdir(), "cs-clips-"));
let mod;
try {
  writeFileSync(
    join(dir, "entry.ts"),
    // find.ts imports nothing, which is why the segment type and the
    // normalizer live there rather than beside the Groq call: bundling
    // that call would drag the whole SDK in for a pure-function test.
    `export * from "${pathToFileURL(join(ROOT, "lib/clips/find.ts")).pathname}";`,
  );
  const built = spawnSync("npx", ["--yes", "esbuild", join(dir, "entry.ts"), "--bundle",
    "--format=esm", "--platform=node",
    `--outfile=${join(dir, "out.mjs")}`], { encoding: "utf8" });
  if (built.status !== 0) {
    console.log("\nClip finder: SKIPPED (esbuild could not bundle the modules).");
    console.log(built.stderr?.slice(0, 300) ?? "");
    process.exit(0);
  }
  mod = await import(pathToFileURL(join(dir, "out.mjs")).href);
} catch (e) {
  console.log(`\nClip finder: SKIPPED (${e?.message ?? "could not build"}).\n`);
  process.exit(0);
}
const {
  validateClips, normalizeSegments, nearest, openingFrom,
  MIN_CLIP_SECONDS, MAX_CLIP_SECONDS, findUserPrompt,
} = mod;

// A take: twelve sentences, roughly ten seconds each, 0 to 120.
const SEGMENTS = Array.from({ length: 12 }, (_, i) => ({
  start: i * 10,
  end: i * 10 + 10,
  text: `sentence ${i + 1}`,
}));

console.log("\nChecking what the model picked\n");

const good = validateClips(
  { clips: [{ start: 10, end: 40, opening: "sentence 2", why: "lands it" }] },
  SEGMENTS,
);
check("a clean suggestion survives untouched", good.length === 1 && good[0].start === 10 && good[0].end === 40, JSON.stringify(good));
check("...keeping his words and the reason", good[0]?.opening === "sentence 2" && good[0]?.why === "lands it");

check(
  "a clip that starts after the video ends is refused",
  validateClips({ clips: [{ start: 300, end: 340 }] }, SEGMENTS).length === 0,
  "snapping would pull it back to the last boundary, where it has no length",
);
check(
  "a negative start is not trusted",
  validateClips({ clips: [{ start: -50, end: 30 }] }, SEGMENTS).every((c) => c.start >= 0),
);
check(
  "a clip that runs past the end stops at the last thing he said",
  validateClips({ clips: [{ start: 80, end: 400 }] }, SEGMENTS)[0]?.end === 120,
  JSON.stringify(validateClips({ clips: [{ start: 80, end: 400 }] }, SEGMENTS)),
);
check(
  `a clip under ${MIN_CLIP_SECONDS} seconds is refused`,
  validateClips({ clips: [{ start: 10, end: 20 }] }, SEGMENTS).length === 0,
  "ten seconds snapped from a boundary is a moment, not a clip",
);
check(
  `a clip over ${MAX_CLIP_SECONDS} seconds is refused`,
  validateClips({ clips: [{ start: 0, end: 120 }] }, SEGMENTS).length === 0,
  "that is the video again",
);
check(
  "end before start is refused",
  validateClips({ clips: [{ start: 60, end: 20 }] }, SEGMENTS).length === 0,
);
check(
  "a clip with no length is refused",
  validateClips({ clips: [{ start: 30, end: 30 }] }, SEGMENTS).length === 0,
);

const overlapping = validateClips(
  { clips: [
    { start: 10, end: 50, why: "first" },
    { start: 40, end: 80, why: "overlaps the first by ten seconds" },
    { start: 80, end: 110, why: "clear of both" },
  ] },
  SEGMENTS,
);
check(
  "an overlapping clip is dropped, not trimmed",
  overlapping.length === 2 && overlapping.some((c) => c.why === "first") &&
    overlapping.some((c) => c.why === "clear of both"),
  JSON.stringify(overlapping.map((c) => [c.start, c.end])),
);
check(
  "...and a clip that only touches at the boundary is kept",
  validateClips({ clips: [{ start: 10, end: 50 }, { start: 50, end: 90 }] }, SEGMENTS).length === 2,
  "adjoining is not overlapping, and refusing it would lose a good second clip",
);

check(
  "a time a little off a sentence boundary is snapped to it",
  (() => {
    const c = validateClips({ clips: [{ start: 10.4, end: 49.6 }] }, SEGMENTS)[0];
    return c?.start === 10 && c?.end === 50;
  })(),
  JSON.stringify(validateClips({ clips: [{ start: 10.4, end: 49.6 }] }, SEGMENTS)),
);
check(
  "nearest picks the closest boundary",
  nearest([0, 10, 20, 30], 23) === 20 && nearest([0, 10, 20, 30], 26) === 30,
);

// Needs a longer take than SEGMENTS: with twelve ten-second sentences
// and a twelve-second minimum, only six non-overlapping clips fit
// anyway, so the cap would hold even with the cap removed.
const LONG = Array.from({ length: 40 }, (_, i) => ({
  start: i * 10, end: i * 10 + 10, text: `line ${i + 1}`,
}));
const many = validateClips(
  { clips: Array.from({ length: 11 }, (_, i) => ({ start: i * 30, end: i * 30 + 20 })) },
  LONG,
);
check(
  "a list longer than six is cut to six",
  many.length <= 6,
  `${many.length} kept`,
);
check(
  "...and the kept ones still do not overlap",
  many.every((c, i) => i === 0 || c.start >= many[i - 1].end),
  JSON.stringify(many.map((c) => [c.start, c.end])),
);

check("an empty answer is an empty list", validateClips({ clips: [] }, SEGMENTS).length === 0);
check("a missing answer is an empty list", validateClips({}, SEGMENTS).length === 0);
check("nonsense is an empty list", validateClips(null, SEGMENTS).length === 0);
check(
  "clips are returned in the order they happen",
  (() => {
    const out = validateClips({ clips: [{ start: 80, end: 110 }, { start: 10, end: 40 }] }, SEGMENTS);
    return out.length === 2 && out[0].start === 10;
  })(),
);
check(
  "a clip with no opening gets his actual words",
  validateClips({ clips: [{ start: 30, end: 60 }] }, SEGMENTS)[0]?.opening === "sentence 4",
  JSON.stringify(validateClips({ clips: [{ start: 30, end: 60 }] }, SEGMENTS)),
);
check(
  "times that are not numbers are skipped",
  validateClips({ clips: [{ start: "soon", end: "later" }, { start: 10, end: 40 }] }, SEGMENTS).length === 1,
);
check(
  "infinity is not a time",
  validateClips({ clips: [{ start: 0, end: Infinity }] }, SEGMENTS).length === 0,
);
check(
  "with no transcript there are no clips",
  validateClips({ clips: [{ start: 10, end: 40 }] }, []).length === 0,
  "a clip over a recording nobody heard cannot be checked against anything",
);

console.log("\n  What the model is given");
const prompt = findUserPrompt(SEGMENTS);
check("the prompt carries the length of the recording", /120\.0 seconds long/.test(prompt), prompt.slice(0, 80));
check("every line carries its own times", (prompt.match(/^\d+\.\d to \d+\.\d: /gm) ?? []).length === 12);
check("it is told to end on the last word that matters", /not on a trailing/i.test(mod.FIND_SYSTEM));
check("it is allowed to return nothing", /return an empty list/i.test(mod.FIND_SYSTEM),
  "a model with no honest option invents four clips");
check("it is told clips must not overlap", /must not overlap/i.test(mod.FIND_SYSTEM));

console.log("\n  Segments from the transcriber");
check(
  "segments arriving out of order are sorted",
  JSON.stringify(normalizeSegments([
    { start: 10, end: 20, text: "b" }, { start: 0, end: 10, text: "a" },
  ]).map((s) => s.text)) === '["a","b"]',
);
check(
  "a segment that ends before it starts is dropped",
  normalizeSegments([{ start: 20, end: 10, text: "x" }]).length === 0,
  "this one produces a clip of negative length further down",
);
check(
  "a segment with no words is dropped",
  normalizeSegments([{ start: 0, end: 5, text: "   " }]).length === 0,
);
check(
  "a segment with no times is dropped",
  normalizeSegments([{ text: "words but no clock" }]).length === 0,
);
check("nothing at all is an empty list", normalizeSegments(undefined).length === 0);

console.log("\n  The route");
const route = readFileSync(join(ROOT, "app/api/clips/route.ts"), "utf8");
check(
  "the route checks the model's answer rather than trusting it",
  /validateClips\(/.test(route),
);
check(
  "...passing it the transcript to check against",
  /validateClips\([\s\S]{0,400}segments,\s*\n?\s*\)/.test(route),
  "checking against nothing would accept every bad clip above",
);
check(
  "the transcript is returned too, so a wrong list can be judged",
  /segments,\n/.test(route),
);

try { rmSync(dir, { recursive: true, force: true }); } catch {}

console.log(
  failures.length === 0
    ? `\nAll ${passed} checks passed.\n`
    : `\n${failures.length} FAILURE(S), ${passed} passed.\n`,
);
process.exit(failures.length === 0 ? 0 : 1);
