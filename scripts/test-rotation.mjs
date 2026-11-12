#!/usr/bin/env node
/**
 * A video filmed upright must save upright.
 *
 * Aaron, on the first export the fast cutter made: "onn the video when it
 * saved it was 90 degrees didnt save verticle like i recoreed it".
 *
 * A phone held upright does not record upright pixels. It records a
 * landscape frame and writes down that the picture should be turned a
 * quarter turn to be seen properly, and every player obeys that note.
 * The old export never had to think about it, because it drew through a
 * video element, which turns the picture before anything is captured.
 * The fast one decodes the frames as stored, sideways, so unless the note
 * is carried across the finished video comes out on its side.
 *
 * This checks both halves of carrying it: that the note is read off the
 * input, and that it is written onto the output. Neither needs WebCodecs,
 * which Node does not have, so this runs here rather than in a browser,
 * against a file with the same shape as the one off his phone: 1920 by
 * 1080 with a quarter turn recorded against it.
 *
 *   node scripts/test-rotation.mjs
 *
 * Needs ffmpeg to build the fixture and ffprobe to read the result back.
 * Skips with a note rather than failing when they are absent.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function has(cmd) {
  return spawnSync("which", [cmd]).status === 0;
}
if (!has("ffmpeg") || !has("ffprobe")) {
  console.log("\nRotation: SKIPPED (needs ffmpeg and ffprobe).\n");
  process.exit(0);
}
if (!existsSync("node_modules/mediabunny")) {
  console.log("\nRotation: SKIPPED (mediabunny is not installed; run npm install).\n");
  process.exit(0);
}

const {
  ALL_FORMATS, EncodedPacketSink, EncodedVideoPacketSource, FilePathSource,
  FilePathTarget, Input, Mp4OutputFormat, Output,
} = await import("mediabunny");

let passed = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) { passed++; console.log(`  PASS  ${label}`); }
  else { failures.push(label); console.log(`  FAIL  ${label}${detail ? `\n          ${detail}` : ""}`); }
}

const dir = mkdtempSync(join(tmpdir(), "cs-rot-"));
const plain = join(dir, "plain.mp4");
const rotated = join(dir, "rotated.mp4");
const out = join(dir, "out.mp4");

console.log("\nA video filmed upright\n");

// The same shape a phone produces: landscape pixels, with a note saying
// to turn them.
execFileSync("ffmpeg", [
  "-v", "error", "-f", "lavfi", "-i", "testsrc=size=1920x1080:rate=30:duration=2",
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-y", plain,
]);
execFileSync("ffmpeg", [
  "-v", "error", "-display_rotation", "90", "-i", plain, "-c", "copy", "-y", rotated,
]);

function rotationOf(path) {
  const text = execFileSync("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream_side_data=rotation",
    "-of", "default=noprint_wrappers=1:nokey=1", path,
  ]).toString().trim();
  return text === "" ? 0 : Number(text);
}

check(
  "the test file really is a landscape frame with a quarter turn on it",
  Math.abs(rotationOf(rotated)) === 90,
  `ffprobe reports ${rotationOf(rotated)} degrees, so this test would prove nothing`,
);

// Read the note off the input.
const input = new Input({ source: new FilePathSource(rotated), formats: ALL_FORMATS });
const track = await input.getPrimaryVideoTrack();
const readRotation = await track.getRotation();
// ffmpeg counts the turn one way and mediabunny counts it the other, so
// 90 and 270 describe the same quarter turn. An earlier version of this
// asserted the number rather than the fact, and failed on a correct
// round trip. What matters is that a turn was seen at all, and below,
// that the same one comes out.
check(
  "a quarter turn is read off the file we were given",
  readRotation === 90 || readRotation === 270,
  `read ${readRotation} degrees; the export would have no idea the picture needs turning`,
);
check(
  "the stored frame really is landscape, which is why the note matters",
  track.codedWidth > track.codedHeight,
  `stored at ${track.codedWidth}x${track.codedHeight}`,
);

// Write it back out, carrying the note. Packets are copied rather than
// re-encoded, because Node has no encoder; the muxing is the part under
// test and it is the same muxing the real export uses.
const output = new Output({ format: new Mp4OutputFormat(), target: new FilePathTarget(out) });
const source = new EncodedVideoPacketSource(track.codec);
output.addVideoTrack(source, { rotation: readRotation, flip: await track.getFlip() });
await output.start();
const sink = new EncodedPacketSink(track);
let first = true;
for await (const packet of sink.packets()) {
  await source.add(packet, first ? { decoderConfig: await track.getDecoderConfig() } : undefined);
  first = false;
}
await output.finalize();

const wrote = rotationOf(out);
const given = rotationOf(rotated);
check(
  "...and the file we hand back is turned exactly the same way",
  wrote === given,
  `we were given ${given} degrees and handed back ${wrote}, so a video filmed upright does not play upright`,
);

// The control. Without passing it on, the note is lost, which is exactly
// what went wrong. If this somehow still came out rotated, the check
// above would be passing for a reason that has nothing to do with us.
const bare = join(dir, "bare.mp4");
const output2 = new Output({ format: new Mp4OutputFormat(), target: new FilePathTarget(bare) });
const source2 = new EncodedVideoPacketSource(track.codec);
output2.addVideoTrack(source2);
await output2.start();
let first2 = true;
for await (const packet of sink.packets()) {
  await source2.add(packet, first2 ? { decoderConfig: await track.getDecoderConfig() } : undefined);
  first2 = false;
}
await output2.finalize();
check(
  "control: leaving the note off really does lose it",
  rotationOf(bare) !== given,
  "the output is turned even when nothing asked for it, so the check above proves nothing",
);

console.log(
  failures.length === 0
    ? `\nAll ${passed} checks passed. Upright in, upright out.\n`
    : `\n${failures.length} FAILURE(S), ${passed} passed.\n`,
);
process.exit(failures.length === 0 ? 0 : 1);
