#!/usr/bin/env node
/**
 * Every source the app can write must be one the table accepts.
 *
 * This is a regression test for a bug that shipped and sat there. 0016
 * created `ideas` with a check constraint listing five allowed sources.
 * The Suggest Ideas button wrote 'suggested', which was not one of them,
 * so keeping a suggested idea failed on the insert every single time,
 * with a raw constraint error that reads like a server hiccup. Nothing
 * noticed, because no test ever wrote that value to a real table.
 *
 * So the check is not "is 'talk' allowed now". It is: find every source
 * string the code can pass, and prove the database takes each one. A new
 * source added in a year is then either on the list or caught here.
 *
 *   node scripts/test-idea-sources.mjs
 *
 * Builds its own throwaway database and removes it. Skips with a note
 * when Postgres is not installed.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
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
 * Every source value the code can hand to createIdea.
 *
 * Found by reading the code rather than listed here, so a source added
 * without a thought about the constraint is still covered. Two shapes
 * are searched: `source: "x"` in an object passed along, and
 * `source: "x"` written straight into a createIdea call.
 */
function sourcesInCode() {
  const found = new Set();
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!/\.(ts|tsx)$/.test(entry.name)) continue;
      const src = readFileSync(full, "utf8");
      // Only files that actually reach createIdea. `voice_answers` has a
      // source column of its own ("typed" / "spoken"), and counting those
      // would make this test demand that the ideas table accept them.
      if (!/createIdea/.test(src)) continue;
      for (const m of src.matchAll(/\bsource:\s*"([a-z-]+)"/g)) found.add(m[1]);
      for (const m of src.matchAll(/\bsource\s*\?\?\s*"([a-z-]+)"/g)) found.add(m[1]);
    }
  };
  for (const d of ["app", "lib", "components"]) walk(join(ROOT, d));
  return [...found].sort();
}

const PG = "/usr/lib/postgresql/16/bin";
if (!existsSync(`${PG}/initdb`) || spawnSync("id", ["claude"]).status !== 0) {
  console.log("\nIdea sources: SKIPPED (no local Postgres, or no unprivileged user to run it as).\n");
  process.exit(0);
}

const base = mkdtempSync(join(tmpdir(), "cs-src-"));
const PORT = "5561";
const asClaude = (cmd) => execFileSync("su", ["claude", "-c", cmd], { encoding: "utf8" });
let n = 0;
const psql = (sql) => {
  const file = join(base, `q${n++}.sql`);
  writeFileSync(file, sql, { mode: 0o644 });
  return asClaude(`${PG}/psql -h ${base} -p ${PORT} -U claude -d t -tAq -v ON_ERROR_STOP=1 -f ${file}`);
};

try {
  execFileSync("chmod", ["o+rx", base]);
  execFileSync("chown", ["-R", "claude", base]);
  asClaude(`${PG}/initdb -D ${base}/data -U claude --auth=trust`);
  asClaude(`${PG}/pg_ctl -D ${base}/data -o "-p ${PORT} -k ${base}" -l ${base}/log start -w`);
  asClaude(`${PG}/createdb -h ${base} -p ${PORT} -U claude t`);

  console.log("\nIdea sources the app writes\n");

  // Just the column and the constraint, taken from the migrations
  // themselves so the test cannot pass against a constraint it invented.
  const created = readFileSync(join(ROOT, "migrations/0016_ideas.sql"), "utf8");
  const widened = readFileSync(join(ROOT, "migrations/0025_idea_sources.sql"), "utf8");
  const originalCheck = /constraint ideas_source_check\s*\n?\s*check \(([\s\S]*?)\)\s*\n\);/.exec(created)?.[1];
  // Captures the inner `source in (...)` whole, closing paren included,
  // so it can be put back inside a check() without going unbalanced.
  const newCheck = /add constraint ideas_source_check\s*\n\s*check \(([\s\S]*?\n\s*\))\)\s*;/.exec(widened)?.[1];
  check("the original constraint could be read from 0016", Boolean(originalCheck));
  check("the widened constraint could be read from 0025", Boolean(newCheck));

  psql(`create table ideas (
    id bigint generated always as identity primary key,
    title text not null,
    source text not null default 'capture',
    constraint ideas_source_check check (${originalCheck})
  );`);

  const sources = sourcesInCode();
  check(
    "source values were found in the code at all",
    sources.length >= 3,
    `found ${JSON.stringify(sources)} -- if this is empty the search is broken, not the code`,
  );
  console.log(`  (found in the code: ${sources.join(", ")})`);

  // Before the fix, to prove the bug was real and that this test would
  // have caught it.
  const rejectedBefore = sources.filter((s) => {
    try { psql(`insert into ideas (title, source) values ('x', '${s}')`); return false; }
    catch { return true; }
  });
  check(
    "the old constraint really did reject sources the app writes",
    rejectedBefore.includes("suggested"),
    `rejected ${JSON.stringify(rejectedBefore)}; 'suggested' should be among them, since that is the shipped bug`,
  );

  // Now apply the widening exactly as the migration does.
  // The newline before the closing paren matters: the constraint carries
  // inline `--` comments, and on one line the last one swallows it.
  psql(`alter table ideas drop constraint if exists ideas_source_check;
        alter table ideas add constraint ideas_source_check check (${newCheck}
        );`);

  const stillRejected = sources.filter((s) => {
    try { psql(`insert into ideas (title, source) values ('y', '${s}')`); return false; }
    catch { return true; }
  });
  check(
    "every source the app can write is now accepted",
    stillRejected.length === 0,
    `still rejected: ${JSON.stringify(stillRejected)} -- add them to 0025 or stop writing them`,
  );

  let nonsense = false;
  try { psql(`insert into ideas (title, source) values ('z', 'definitely-not-a-source')`); }
  catch { nonsense = true; }
  check(
    "a source nobody meant is still refused",
    nonsense,
    "widening the list must not turn into dropping it, or a typo gets stored forever",
  );

  // The card has to be able to name each one, or an idea shows a raw code.
  const labels = readFileSync(join(ROOT, "components/ideas/IdeaList.tsx"), "utf8");
  const unlabelled = sources.filter((s) => !labels.includes(`=== "${s}"`));
  check(
    "each source has words for it on the card",
    unlabelled.length === 0,
    `no label for ${JSON.stringify(unlabelled)} -- these print as the raw code under the idea`,
  );
} finally {
  try { asClaude(`${PG}/pg_ctl -D ${base}/data stop -m immediate`); } catch {}
  try { rmSync(base, { recursive: true, force: true }); } catch {}
}

console.log(
  failures.length === 0
    ? `\nAll ${passed} checks passed.\n`
    : `\n${failures.length} FAILURE(S), ${passed} passed.\n`,
);
process.exit(failures.length === 0 ? 0 : 1);
