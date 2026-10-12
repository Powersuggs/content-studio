#!/usr/bin/env node
/**
 * Fails if any SQL statement touching a per-account table forgets to mention
 * account_id.
 *
 * The runtime isolation test proves the pages that exist today are safe. This
 * catches the next one: someone adds a query in six months, forgets the
 * filter, and nothing visibly breaks because they are testing as the only
 * account on their machine. Here it fails immediately, at build time, with the
 * file and line.
 *
 *   node scripts/check-account-scoping.mjs
 *
 * An intentional exception is marked with a comment on the line before:
 *   // scoping-exempt: <why>
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;

/** Tables whose rows belong to exactly one account. */
const SCOPED_TABLES = [
  "posts",
  "insights",
  "remakes",
  "scripts",
  "boards",
  "board_posts",
  "profile",
  "auth",
  "lending_facts",
  "credit_ledger",
  "render_jobs",
  "assets",
  "voice_answers",
  "voice_profile",
];

/** Files whose job is to work across accounts, or before one exists. */
const EXEMPT_FILES = [
  "lib/db.ts",
  "scripts/",
  "migrations/",
  // Login and setup necessarily read `accounts` before a session exists, and
  // `accounts` is not itself a per-account table.
  "app/api/login/route.ts",
  "app/api/setup/route.ts",
  "app/api/logout/route.ts",
];

const SQL_VERBS = /\b(from|join|into|update|delete\s+from)\s+([a-z_]+)/gi;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === ".git") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

const problems = [];

for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file);
  if (EXEMPT_FILES.some((e) => rel.startsWith(e))) continue;

  const text = readFileSync(file, "utf8");
  // Each backtick-delimited template literal that looks like SQL.
  const literals = text.match(/`[^`]*`/g) ?? [];

  for (const literal of literals) {
    if (!/\b(select|insert|update|delete)\b/i.test(literal)) continue;

    const tables = new Set();
    for (const m of literal.matchAll(SQL_VERBS)) {
      const t = m[2].toLowerCase();
      if (SCOPED_TABLES.includes(t)) tables.add(t);
    }
    if (tables.size === 0) continue;
    if (/account_id/i.test(literal)) continue;

    const index = text.indexOf(literal);
    const line = text.slice(0, index).split("\n").length;
    const prior = text.slice(0, index).split("\n").slice(-3).join("\n");
    if (/scoping-exempt:/.test(prior)) continue;

    problems.push({
      file: rel,
      line,
      tables: [...tables].join(", "),
      snippet: literal.replace(/\s+/g, " ").slice(1, 90),
    });
  }
}

if (problems.length === 0) {
  console.log("\nAccount scoping check: every SQL statement touching a per-account table filters by account_id.\n");
  process.exit(0);
}

console.error(`\nAccount scoping check FAILED: ${problems.length} statement(s) touch a per-account table without mentioning account_id.\n`);
for (const p of problems) {
  console.error(`  ${p.file}:${p.line}  [${p.tables}]`);
  console.error(`    ${p.snippet}...\n`);
}
console.error("Add the account filter, or mark it with a `// scoping-exempt: <why>` comment above if it genuinely works across accounts.\n");
process.exit(1);
