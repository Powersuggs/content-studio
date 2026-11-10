#!/usr/bin/env node
/**
 * The editing room, checked against what Aaron asked it to do.
 *
 * Every line here comes from him using it on a phone and saying what was
 * missing. They are cheap checks over the source, not a substitute for
 * opening it, but they stop any of these quietly going away again.
 *
 *   node scripts/check-edit-room.mjs
 */
import { readFileSync } from "node:fs";

let passed = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) { passed++; console.log(`  PASS  ${label}`); }
  else { failures.push(label); console.log(`  FAIL  ${label}${detail ? `\n          ${detail}` : ""}`); }
}

const room = readFileSync("components/session-mode/EditRoom.tsx", "utf8");
const wave = readFileSync("components/session-mode/Waveform.tsx", "utf8");

console.log("\nThe editing room\n");

// "THE PUT IT BACK SCREEN IT DOESNT HAVE A BACK BUTTON AT ALL"
check(
  "there is a back button with a word on it, not just an icon",
  /Back to pieces/.test(room),
  "an X alone in the corner is not something he can find",
);

// "I am not seeing anythig that is being cut ... make sure the cut out
//  pieces are in red highlight"
check(
  "what is being cut is drawn in red",
  /rgba\(239, 68, 68/.test(wave),
  "it was a polite amber at a sixth opacity, which on a phone is invisible",
);
check(
  "the bars inside a cut are red too, not just the wash behind them",
  /rgba\(248, 113, 113/.test(wave),
);
check(
  "each cut has a hard edge, so a narrow one still shows",
  /fillRect\(left, 0, 1\.5, height\)/.test(wave),
);
check(
  "the screen says what the red means",
  /Red is what gets cut out/.test(room),
);

// "when i place the cut i need to be able to zoom into it to get it
//  closer to get the right frame if i am doing by hand"
check(
  "the sound waves can be zoomed",
  /zoom/.test(wave) && /ZoomIn/.test(room),
);
check(
  "zoomed in, the view follows the playhead rather than staying at the start",
  /playhead - span \/ 2/.test(wave),
);
check(
  "the playhead can be moved a tenth of a second at a time",
  /nudgePlayhead/.test(room),
);

// "i do want to be able to play it with the cuts out as they are to hear
//  it or manually move it as needed"
check(
  "it can be played with the cuts taken out",
  /Play with cuts/.test(room),
);
check(
  "...and still played as filmed, which is a different question",
  /As filmed/.test(room),
);
check(
  "the preview is checked every frame, not on timeupdate",
  /requestAnimationFrame\(tick\)/.test(room),
  "timeupdate fires about four times a second, so a quarter second of the cut plays",
);
check(
  "a found cut can be moved by hand, not only switched off",
  /Start later/.test(room) && /End earlier/.test(room),
  "found gaps and his own are one list now, so both can be adjusted",
);
check(
  "an edge cannot be dragged past the other one",
  /next\.end - next\.start < 0\.05/.test(room),
  "a cut turned inside out stops removing anything, silently",
);

// The bug that made the list come back empty.
check(
  "the cut list waits for the sound to arrive before deciding there are none",
  /audio\.loudness\.length === 0 && !audio\.error/.test(room),
  "the hook reports loading false for one render before it starts, which seeded an empty list",
);

console.log(
  failures.length === 0
    ? `\nAll ${passed} checks passed.\n`
    : `\n${failures.length} FAILURE(S), ${passed} passed.\n`,
);
process.exit(failures.length === 0 ? 0 : 1);
