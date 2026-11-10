#!/usr/bin/env node
/**
 * The camera framing rules.
 *
 * Aaron filmed with the real thing and said: "i dont like how the camera
 * seemed zoom in on it". He was right twice over. The capture asked a 4:3
 * phone sensor for a 9:16 frame, so a quarter of the width was thrown away
 * before we ever saw it, and then the preview stretched what was left to
 * fill a screen taller again, cutting another fifth off the sides of the
 * picture he was framing himself against.
 *
 * The second one is the nastier bug: a preview TIGHTER than the recording
 * means standing where you look right on screen puts you wrong in the
 * video, and you find out afterwards.
 *
 *   node scripts/test-framing.mjs
 */
import { fitFrame, showsReelGuide, needsReelShape, REEL_ASPECT } from "../lib/session/framing.ts";

let passed = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) { passed++; console.log(`  PASS  ${label}`); }
  else { failures.push(label); console.log(`  FAIL  ${label}${detail ? `\n          ${detail}` : ""}`); }
}

console.log("\nCamera framing\n");

// Real sensor shapes, as the devices actually report them.
const IPHONE_FRONT = 3 / 4;       // 1440x1920, portrait 4:3
const LAPTOP_WEBCAM = 16 / 9;     // 1920x1080, landscape
const REEL = REEL_ASPECT;         // 1080x1920

console.log("  Which cameras get asked for a reel shape");
check(
  "a laptop webcam does, because a reel cannot be a letterbox",
  needsReelShape(1920, 1080),
);
check(
  "an iPhone front camera does TOO, so the preview is the finished frame",
  needsReelShape(1440, 1920),
  "leaving it wide showed him more than the export keeps, and he framed against that",
);
check("a square camera does", needsReelShape(1080, 1080));
check(
  "a frame already 9:16 is left alone, because there is nothing to take",
  !needsReelShape(1080, 1920),
);
check("nonsense dimensions do not trigger a crop", !needsReelShape(0, 0));

console.log("\n  The preview must show exactly what is recorded");
// The space the camera gets on an iPhone 13 in Safari, under the prompter
// controls: 390 wide, 539 tall. That box is 0.724 wide-to-tall.
const AREA_W = 390, AREA_H = 539;
for (const [name, aspect] of [
  ["iPhone front camera", IPHONE_FRONT],
  ["laptop webcam", LAPTOP_WEBCAM],
  ["a frame already reel-shaped", REEL],
]) {
  const f = fitFrame(AREA_W, AREA_H, aspect);
  const got = f.width / f.height;
  check(
    `${name}: preview is the same shape as the recording`,
    Math.abs(got - aspect) < 0.01,
    `preview ${f.width}x${f.height} is ${got.toFixed(3)}, camera is ${aspect.toFixed(3)}`,
  );
  check(
    `${name}: preview fits on screen without being cut off`,
    f.width <= AREA_W + 1 && f.height <= AREA_H + 1,
    `preview ${f.width}x${f.height} does not fit in ${AREA_W}x${AREA_H}`,
  );
}

// The specific regression. Before the fix the preview was the whole box,
// 390x539, while the camera was sending 9:16. Anyone reproducing that by
// hand should see this fail.
{
  const f = fitFrame(AREA_W, AREA_H, REEL);
  const stretched = AREA_W / AREA_H;
  check(
    "the preview is NOT just the whole box, which is what cropped the sides",
    Math.abs(f.width / f.height - stretched) > 0.1,
    `preview came back ${f.width}x${f.height}, the same shape as the box`,
  );
  check(
    "...and it is narrower than the box, so there are black bars not a crop",
    f.width < AREA_W,
    `preview is ${f.width} wide in a ${AREA_W} box`,
  );
}

console.log("\n  The guide showing what a reel keeps");
check("shown for an iPhone front camera, which is wider than a reel", showsReelGuide(IPHONE_FRONT));
check("shown for a laptop webcam", showsReelGuide(LAPTOP_WEBCAM));
check(
  "NOT shown when the frame is already reel-shaped, where it would trace the edge",
  !showsReelGuide(REEL),
);

console.log("\n  Odd sizes do not crash or return nonsense");
check("zero-sized area returns nothing to draw", fitFrame(0, 0, IPHONE_FRONT).width === 0);
check("zero aspect returns nothing to draw", fitFrame(390, 539, 0).width === 0);

console.log(
  failures.length === 0
    ? `\nAll ${passed} checks passed. What he sees is what gets recorded.\n`
    : `\n${failures.length} FAILURE(S), ${passed} passed.\n`,
);
process.exit(failures.length === 0 ? 0 : 1);
