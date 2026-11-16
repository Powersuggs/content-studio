#!/usr/bin/env node
/**
 * A page that reads the database has to survive the database not being
 * ready for it.
 *
 * Two things are normal on a brand new account: a migration has not been
 * run yet, and no Instagram handle is connected. Both make the queries
 * throw. A page that does not catch that renders
 *
 *   "Application error: a server-side exception has occurred"
 *
 * which tells the person nothing, looks like the whole app is broken,
 * and sends them to logs they cannot read. Autopsy and Session Prep both
 * did this, and it was only found by actually signing up as a new
 * person. Nothing in the code looked wrong.
 *
 * safeLoad catches it and hands back a message naming the fix, which
 * SetupNotice then shows. So: any page importing a module that touches
 * the database has to use safeLoad.
 *
 *   node scripts/check-page-setup.mjs
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

let passed = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) { passed++; console.log(`  PASS  ${label}`); }
  else { failures.push(label); console.log(`  FAIL  ${label}${detail ? `\n          ${detail}` : ""}`); }
}

/**
 * Resolve an import to a file on disk.
 *
 * Both "@/lib/x" and "./x", because the first version of this only
 * followed the "@/" form. lib/queries.ts imports the database with
 * `from "./db"`, so every page that reads through it went undetected
 * and the check passed on pages that were actually crashing.
 */
function resolveImport(spec, fromFile) {
  let base;
  if (spec.startsWith("@/")) base = join(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = join(dirname(fromFile), spec);
  else return null;
  for (const p of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    if (existsSync(p)) return p;
  }
  return null;
}

const DB_FILE = join(ROOT, "lib/db.ts");

/** Does this module reach the database, directly or one step away? */
const touchesDb = new Map();
function reachesDatabase(file, depth = 0) {
  if (touchesDb.has(file)) return touchesDb.get(file);
  if (depth > 3) return false;
  touchesDb.set(file, false); // guards import cycles
  const src = readFileSync(file, "utf8");
  // A client component runs in the browser. Whatever it reaches for
  // happens behind a server action with its own error handling, not
  // while the page is being rendered, so it cannot crash the render.
  if (/^\s*["']use client["']/.test(src)) return false;
  let answer = false;
  for (const m of src.matchAll(/from "([^"]+)"/g)) {
    const next = resolveImport(m[1], file);
    if (!next) continue;
    if (next === DB_FILE) { answer = true; break; }
    if (next !== file && reachesDatabase(next, depth + 1)) { answer = true; break; }
  }
  touchesDb.set(file, answer);
  return answer;
}

function pages(dir, found = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) pages(full, found);
    else if (name === "page.tsx") found.push(full);
  }
  return found;
}

console.log("\nPages that read the database\n");

const all = pages(join(ROOT, "app"));
check("there are pages to check", all.length > 10, `${all.length}`);

const reading = [];
const unguarded = [];
for (const page of all) {
  const src = readFileSync(page, "utf8");
  const imports = [...src.matchAll(/from "([^"]+)"/g)].map((m) => resolveImport(m[1], page));
  const reads = imports.some((f) => f && reachesDatabase(f));
  if (!reads) continue;
  reading.push(page);
  // safeLoad is the normal way. An explicit .catch is also fine and is
  // sometimes the only correct answer: the public data-deletion status
  // page catches and says "no request found" rather than showing a
  // setup notice, because a stranger holding a confirmation code must
  // not be told anything about the state of the database.
  const guarded = /safeLoad\(/.test(src) || /\.catch\(/.test(src);
  if (!guarded) unguarded.push(page.replace(`${ROOT}/`, ""));
}

check("some pages do read it, so this check means something", reading.length > 8, `${reading.length}`);
check(
  "every page that reads the database catches a setup problem",
  unguarded.length === 0,
  `these will render "Application error" on a new account instead of saying what to do:\n          ${unguarded.join("\n          ")}`,
);

console.log("\n  The notice itself");
const notice = readFileSync(join(ROOT, "components/SetupNotice.tsx"), "utf8");
check(
  "the SQL instruction only shows when a file is actually named",
  /\\\.sql\\b/.test(notice) || /\.sql/.test(notice),
  "it used to tell someone with no Instagram handle to go and run SQL, which does not exist and would not help",
);
check(
  "...and is conditional rather than always rendered",
  /\{\/\\\.sql\\b\/\.test\(message\) && \(/.test(notice) || /test\(message\) &&/.test(notice),
  notice.slice(0, 200),
);

console.log(
  failures.length === 0
    ? `\nAll ${passed} checks passed.\n`
    : `\n${failures.length} FAILURE(S), ${passed} passed.\n`,
);
process.exit(failures.length === 0 ? 0 : 1);
