#!/usr/bin/env node
/**
 * explainDbError must name the right problem.
 *
 * Regression test for a real misdiagnosis. Postgres words a missing COLUMN
 * on an insert as `column "content" of relation "idea_outputs" does not
 * exist`, which contains the exact phrase a missing TABLE produces. The
 * table check matched it and told someone to run the migration that
 * creates a table they already had, while the one they actually needed
 * went unmentioned.
 *
 * Every error below is produced by a real Postgres server rather than
 * typed from memory, because the whole bug was a wrong assumption about
 * the wording.
 *
 *   DATABASE_URL='...' node scripts/test-db-errors.mjs
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(ROOT, "lib", "db-errors.ts"), "utf8");
const LATEST = /LATEST_MIGRATION = "([^"]+)"/.exec(src)[1];

const { DATABASE_URL } = process.env;
if (!DATABASE_URL) { console.error("DATABASE_URL is not set"); process.exit(1); }
const db = new pg.Client({ connectionString: DATABASE_URL });
await db.connect();

// The real implementations, lifted out so the test runs without Next's
// module resolution. Kept in step by asserting the regexes below appear
// verbatim in the source.
const MAP = Object.fromEntries(
  [...(/MIGRATION_FOR_TABLE[^{]*\{([\s\S]*?)\n\};/.exec(src)[1])
    .matchAll(/(\w+):\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]),
);
const msgOf = (e) => (e instanceof Error ? e.message : String(e ?? ""));
const codeOf = (e) => (e && typeof e === "object" && typeof e.code === "string" ? e.code : null);

function missingColumn(err) {
  const m = msgOf(err);
  if (codeOf(err) !== "42703" && !/^column /i.test(m)) return null;
  let x = /^column "([^"]+)" of relation "([^"]+)" does not exist/i.exec(m);
  if (x) return { column: x[1], table: x[2] };
  x = /^column "([^"]+)" does not exist/i.exec(m);
  if (x) return { column: x[1], table: null };
  x = /^column (?:([A-Za-z0-9_]+)\.)?([A-Za-z0-9_]+) does not exist/i.exec(m);
  if (x) return { column: x[2], table: x[1] ?? null };
  return { column: "", table: null };
}
function missingTable(err) {
  if (missingColumn(err)) return null;
  const m = msgOf(err);
  if (codeOf(err) !== "42P01" && !/does not exist/i.test(m)) return null;
  const x = /^relation "([^"]+)" does not exist/i.exec(m);
  return x ? x[1] : null;
}
function explain(err) {
  const t = missingTable(err);
  if (t) return MAP[t]
    ? `This page needs the "${t}" table, which is not in the database yet. Run migrations/${MAP[t]} against it, then reload.`
    : `missing table ${t}, unmapped`;
  const c = missingColumn(err);
  if (c) return `missing column ${c.column}${c.table ? ` on ${c.table}` : ""} -> ${LATEST}`;
  return null;
}

let fails = 0;
const ok = (l, c, d) => { console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${c ? "" : `\n          ${d}`}`); if (!c) fails++; };
const errFor = async (sql) => { try { await db.query(sql); return null; } catch (e) { return e; } };

// The exact bug: a missing column on an insert must NOT read as a missing table.
const insertErr = await errFor(`insert into ideas (no_such_col) values (1)`);
ok("missing column on insert is not called a missing table",
  missingTable(insertErr) === null, `said table: ${missingTable(insertErr)}`);
ok("...and is identified as the column it is",
  missingColumn(insertErr)?.column === "no_such_col", JSON.stringify(missingColumn(insertErr)));
ok("...and points at the newest migration",
  (explain(insertErr) ?? "").includes(LATEST), explain(insertErr));
ok("...and names the table it is on",
  (explain(insertErr) ?? "").includes("on ideas"), explain(insertErr));

const selErr = await errFor(`select no_such_col from ideas`);
ok("missing column on select is a column", missingColumn(selErr)?.column === "no_such_col", msgOf(selErr));
ok("...not a table", missingTable(selErr) === null, String(missingTable(selErr)));

const qualErr = await errFor(`select i.no_such_col from ideas i`);
ok("unquoted qualified column is a column", missingColumn(qualErr)?.column === "no_such_col", msgOf(qualErr));
ok("...not a table", missingTable(qualErr) === null, String(missingTable(qualErr)));

// A genuinely missing table must still work, and name the right file.
const tblErr = await errFor(`select 1 from idea_outputs_nope`);
ok("a real missing table is still detected", missingTable(tblErr) === "idea_outputs_nope", msgOf(tblErr));
ok("...and is not mistaken for a column", missingColumn(tblErr) === null, JSON.stringify(missingColumn(tblErr)));

const mappedErr = await errFor(`drop table if exists zzz; select 1 from newsletters_nope`);
ok("an unmapped missing table says so rather than guessing",
  (explain(mappedErr) ?? "").includes("unmapped"), explain(mappedErr));

// A fault that is NOT a setup problem must fall through untouched.
const realErr = await errFor(`select 1/0`);
ok("a genuine runtime fault is not called a setup problem", explain(realErr) === null,
  `${msgOf(realErr)} -> ${explain(realErr)}`);

// The lifted regexes must match the source, or this test is checking a copy.
for (const needle of [
  'column "([^"]+)" of relation "([^"]+)" does not exist',
  '^relation "([^"]+)" does not exist',
]) {
  ok(`source still contains /${needle}/`, src.includes(needle), "the test has drifted from lib/db-errors.ts");
}

await db.end();
console.log(fails === 0 ? "\ndb errors: all checks passed.\n" : `\n${fails} FAILURE(S)\n`);
process.exit(fails === 0 ? 0 : 1);
