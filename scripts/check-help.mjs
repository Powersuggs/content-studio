#!/usr/bin/env node
/**
 * The help page has to describe the app he actually has.
 *
 * A help page that lists features goes stale the week after it is
 * written, and a stale one is worse than none: it sends him looking for
 * a screen that was renamed and leaves a new screen unmentioned. Neither
 * shows up as a bug. Both make the app feel like it is lying.
 *
 * So the page walks the menu rather than listing screens itself, and
 * this asserts the two things that walking cannot fix on its own: every
 * screen in the menu has words written for it, and nothing is explained
 * that is not there any more.
 *
 *   node scripts/check-help.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

let passed = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) { passed++; console.log(`  PASS  ${label}`); }
  else { failures.push(label); console.log(`  FAIL  ${label}${detail ? `\n          ${detail}` : ""}`); }
}

const nav = read("lib/nav-items.ts");
const guide = read("lib/help/guide.ts");
const page = read("app/how-to/page.tsx");

const navHrefs = [...nav.matchAll(/href:\s*"([^"]+)"/g)].map((m) => m[1]);
const helpHrefs = [...guide.matchAll(/href:\s*"([^"]+)"/g)].map((m) => m[1]);

console.log("\nThe help page against the app\n");

check("the menu was read", navHrefs.length > 5, `found ${navHrefs.length}`);
check("the guide was read", helpHrefs.length > 5, `found ${helpHrefs.length}`);

// The help page itself is in the menu and does not need to explain itself.
const needExplaining = navHrefs.filter((h) => h !== "/how-to");
const missing = needExplaining.filter((h) => !helpHrefs.includes(h));
check(
  "every screen in the menu has words written for it",
  missing.length === 0,
  `nothing written for: ${missing.join(", ")}`,
);

const stale = helpHrefs.filter((h) => !navHrefs.includes(h));
check(
  "nothing is explained that is no longer in the menu",
  stale.length === 0,
  `explained but gone: ${stale.join(", ")}`,
);

for (const href of helpHrefs) {
  const path = href.replace(/^\//, "");
  if (!existsSync(join(ROOT, "app", path, "page.tsx"))) {
    failures.push(`a real page exists at ${href}`);
    console.log(`  FAIL  a real page exists at ${href}`);
  }
}
if (!failures.some((f) => f.startsWith("a real page exists"))) {
  passed++;
  console.log("  PASS  every screen it points at is a real page");
}

check(
  "the page walks the menu rather than listing screens itself",
  /NAV_ITEMS\.map/.test(page),
  "a hand-written list here is the thing that goes stale",
);
check(
  "a screen with nothing written for it says so rather than showing a blank",
  /Not written up yet/.test(page),
);

// The steps have to point somewhere real too.
const loopHrefs = [...guide.matchAll(/href:\s*"([^"]+)",\n\s*\},?\n/g)].map((m) => m[1]);
check(
  "the weekly steps point at screens that exist",
  loopHrefs.every((h) => navHrefs.includes(h)),
  `not in the menu: ${loopHrefs.filter((h) => !navHrefs.includes(h)).join(", ")}`,
);

check(
  "it starts him on the one thing that makes the rest work",
  /Start with Your Voice/.test(page),
  "everything the app writes is worse until the voice interview is done",
);

console.log(
  failures.length === 0
    ? `\nAll ${passed} checks passed.\n`
    : `\n${failures.length} FAILURE(S), ${passed} passed.\n`,
);
process.exit(failures.length === 0 ? 0 : 1);
