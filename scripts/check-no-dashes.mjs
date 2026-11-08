#!/usr/bin/env node
/**
 * No dashes used as punctuation, anywhere in the app's own words.
 *
 * The house rules strip them from anything the model writes. This is the
 * other half: the wording that ships in the source, which no runtime
 * rule touches. Em dash, en dash, and the double hyphen that stands in
 * for one all fail.
 *
 * Comments are out of scope. Nobody reads the source but me, the dashes
 * in there carry meaning for whoever is reading the reasoning, and a
 * line beginning "--" inside a query is SQL syntax rather than
 * punctuation at all. A hyphen inside a word, and the "-" of a CLI flag
 * or a date, were never in scope either.
 *
 *   node scripts/check-no-dashes.mjs
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIRS = ["app", "components", "lib"];
const EXT = /\.(ts|tsx)$/;

/** The file that defines the rule has to name the characters to ban them. */
const ALLOWED_FILES = new Set(["lib/writing/house-rules.ts"]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (EXT.test(name)) out.push(p);
  }
  return out;
}

const problems = [];
for (const dir of DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    const rel = relative(ROOT, file);
    if (ALLOWED_FILES.has(rel)) continue;
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      // A comment line, in any of the shapes this codebase writes them,
      // SQL comments included.
      if (/^\s*(\/\/|\/\*|\*|\{\/\*|--)/.test(line)) return;
      const what =
        line.includes("—") ? "em dash"
        : line.includes("–") ? "en dash"
        : /\s--\s|\w--\w/.test(line) ? "double hyphen"
        : null;
      if (what) problems.push(`${rel}:${i + 1}  ${what}\n    ${line.trim().slice(0, 110)}`);
    });
  }
}

if (problems.length === 0) {
  console.log("No dashes used as punctuation in the app's own words.");
  process.exit(0);
}
console.error(`${problems.length} dash${problems.length === 1 ? "" : "es"} used as punctuation:\n`);
for (const p of problems) console.error(p);
process.exit(1);
