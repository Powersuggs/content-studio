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

console.log(
  failures.length === 0
    ? `\nAll ${passed} checks passed.\n`
    : `\n${failures.length} FAILURE(S), ${passed} passed.\n`,
);
process.exit(failures.length === 0 ? 0 : 1);
