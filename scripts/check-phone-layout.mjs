#!/usr/bin/env node
/**
 * The filming screen must fit on a phone without scrolling.
 *
 * Aaron: "the buttons i have to scrol down the whole page just to get all
 * buttons to show on the phone. not user friendly at all". Two causes,
 * stacked:
 *
 *   1. /session-mode rendered inside the app chrome, so the mobile top bar
 *      sat on top of a screen that had already asked for the full height.
 *      Measured in a real browser at 390x664: the page came out 725 tall.
 *
 *   2. The shell asked for 100vh, and on iOS Safari vh means the height
 *      with the toolbars HIDDEN. So even alone it is taller than the window
 *      by the height of the address bar, and the record button lands
 *      underneath it.
 *
 * Neither shows up in a type check or a build, and neither shows up on a
 * desktop browser, which is how it reached him twice. This is the cheap
 * guard; the expensive one is opening it at phone size and looking.
 *
 *   node scripts/check-phone-layout.mjs
 */
import { readFileSync } from "node:fs";

let passed = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) { passed++; console.log(`  PASS  ${label}`); }
  else { failures.push(label); console.log(`  FAIL  ${label}${detail ? `\n          ${detail}` : ""}`); }
}

const shell = readFileSync("components/AppShell.tsx", "utf8");
const prompter = readFileSync("components/session-mode/Teleprompter.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");

console.log("\nPhone layout of the filming screen\n");

const bareList = /const BARE_PATHS = \[([\s\S]*?)\]/.exec(shell)?.[1] ?? "";
check(
  "/session-mode renders without the app chrome",
  bareList.includes('"/session-mode"'),
  "the mobile top bar gets stacked on a full-height screen and pushes the buttons off the bottom",
);

check(
  "the filming screen does not use 100vh",
  !/className="[^"]*\bh-screen\b/.test(prompter),
  "h-screen is 100vh, which on iOS Safari is taller than the window",
);
check(
  "...it uses the visible-area height instead",
  /className="[^"]*\bh-app\b/.test(prompter),
);
check(
  "the page itself cannot scroll, so nothing can hide below the fold",
  /className="[^"]*\boverflow-hidden\b[^"]*"[^>]*>\s*$|flex h-app flex-col overflow-hidden/m.test(prompter)
    || prompter.includes("h-app flex-col overflow-hidden"),
);

check(
  "h-app is defined",
  /\.h-app\s*\{/.test(css),
);
check(
  "...and resolves to the dynamic viewport height",
  /\.h-app\s*\{[^}]*100dvh/.test(css),
  "without dvh this is the same bug with a different class name",
);
check(
  "...with a plain vh fallback ahead of it for older browsers",
  /\.h-app\s*\{[^}]*100vh[^}]*100dvh/.test(css),
);

check(
  "the filming screen carries its own way out, now that the nav is gone",
  /href="\/dashboard"/.test(prompter),
  "bare means no menu: without this he is stuck on the filming screen",
);

check(
  "the control bar still clears the home indicator",
  /env\(safe-area-inset-bottom\)/.test(prompter),
);

console.log("\nThe menu on a phone");

// Aaron: "i cannot see the whole menu or scroll down to ose eit i can only
// see barly some of the words of history". History is the sixteenth of
// nineteen items. Measured in a browser at 375x560, only twelve fit.
const drawer = /Mobile drawer[\s\S]*?<main/.exec(shell)?.[0] ?? "";
check(
  "the menu scrolls, so the items past the bottom can be reached",
  /overflow-y-auto/.test(drawer),
  "without this the last items, including signing out, are unreachable on a phone",
);
check(
  "the menu is only as tall as the visible screen",
  /\bh-app\b/.test(drawer),
  "a full-height fixed box runs under the iOS address bar, the same fault that hid the filming buttons",
);
check(
  "signing out stays put instead of scrolling away with the list",
  /shrink-0[^"]*">\{accountFooter\}/.test(drawer),
);
check(
  "the menu clears the home indicator at the bottom",
  /safe-area-inset-bottom/.test(drawer),
);

const sidebar = /Desktop sidebar[\s\S]*?<\/aside>/.exec(shell)?.[0] ?? "";
check(
  "the desktop sidebar scrolls too, for a short laptop window",
  /overflow-y-auto/.test(sidebar),
);

console.log("\nControls that cannot work are not shown");
check(
  "the full screen button is hidden where the browser refuses it",
  /fullscreenEnabled/.test(prompter),
  "it did nothing on his phone and the code already knew why",
);

console.log("\nA few lines at a time waits for him");

// Aaron: "the single lines automatically push to the next one without me
// clicking the screen for next ... we need to make sure if i am selecting
// a few lines it goes to the next one when i click the screen".
check(
  "nothing advances the lines on a timer any more",
  !/holdMs/.test(prompter),
  "a timer moved the words on while he was still saying them",
);
check(
  "tapping the screen is what moves them on",
  /onClick=\{\(\) => setChunk\(/.test(prompter),
);
check(
  "the speaking pace dial went with the timer it drove",
  !/Speaking pace/.test(prompter),
  "a setting that changes nothing is worse than no setting",
);
check(
  "play is hidden where there is nothing to play",
  (() => {
    // Checked by structure rather than one long pattern, which broke on a
    // comment sitting between the guard and the button.
    const guard = prompter.indexOf('{mode !== "lines" && (');
    if (guard === -1) return false;
    const close = prompter.indexOf("</button>", guard);
    return close !== -1 && prompter.slice(guard, close).includes("aria-label={playing");
  })(),
  "it would toggle a flag that nothing reads",
);

console.log("\nReading position");
check(
  "the picture sits at the top, not the middle of the screen",
  /flex items-start justify-center overflow-hidden/.test(prompter),
  "reading from the middle puts his eyes below the lens in every take",
);
check(
  "the words sit at the top too",
  !/flex flex-col items-center justify-center px-6 text-center/.test(prompter),
);

console.log(
  failures.length === 0
    ? `\nAll ${passed} checks passed.\n`
    : `\n${failures.length} FAILURE(S), ${passed} passed.\n`,
);
process.exit(failures.length === 0 ? 0 : 1);
