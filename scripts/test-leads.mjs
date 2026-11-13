#!/usr/bin/env node
/**
 * Finding people already collected in the app.
 *
 * Aaron is on Instagram to recruit agents. Every handle he has saved to a
 * board, reverse-engineered on the Inspiration page or torn down is a
 * real person already doing the thing he wants them doing. The Leads page
 * gathers them. The gathering is one query, and the ways it can be subtly
 * wrong all look fine on screen:
 *
 *   his own handle listed as someone to recruit
 *   the same person twice because he typed their handle with a capital
 *   someone missed because they came from a teardown rather than a post
 *   the whole list again every time the button is pressed
 *
 * None of those throws an error. They just make the page quietly wrong,
 * so they are checked here against a real Postgres rather than reasoned
 * about.
 *
 *   node scripts/test-leads.mjs
 *
 * Builds its own throwaway database and removes it. Skips with a note
 * when Postgres is not installed.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";

const PG = "/usr/lib/postgresql/16/bin";
if (!existsSync(`${PG}/initdb`) || spawnSync("id", ["claude"]).status !== 0) {
  console.log("\nLeads: SKIPPED (no local Postgres, or no unprivileged user to run it as).\n");
  process.exit(0);
}

let passed = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) { passed++; console.log(`  PASS  ${label}`); }
  else { failures.push(label); console.log(`  FAIL  ${label}${detail ? `\n          ${detail}` : ""}`); }
}

const base = mkdtempSync(join(tmpdir(), "cs-leads-"));
const data = join(base, "data");
const PORT = "5531";
const asClaude = (cmd) => execFileSync("su", ["claude", "-c", cmd], { encoding: "utf8" });

/**
 * Run SQL through a file rather than -c.
 *
 * Passing it on the command line turned every newline in a multi-line
 * statement into a literal backslash-n, which psql reads as a command it
 * does not have.
 */
let sqlCounter = 0;
const psql = (sql) => {
  const file = join(base, `q${sqlCounter++}.sql`);
  writeFileSync(file, sql, { mode: 0o644 });
  return asClaude(`${PG}/psql -h ${base} -p ${PORT} -U claude -d t -tAq -v ON_ERROR_STOP=1 -f ${file}`);
};

try {
  execFileSync("chmod", ["o+rx", base]);
  execFileSync("chown", ["-R", "claude", base]);
  asClaude(`${PG}/initdb -D ${data} -U claude --auth=trust`);
  asClaude(`${PG}/pg_ctl -D ${data} -o "-p ${PORT} -k ${base}" -l ${base}/log start -w`);
  asClaude(`${PG}/createdb -h ${base} -p ${PORT} -U claude t`);

  console.log("\nFinding people already collected\n");

  // Just enough of the schema for the query under test.
  psql(`
    create table profile (account_id bigint, handle text);
    create table social_handles (account_id bigint, handle text);
    create table posts (account_id bigint, platform text, handle text);
    create table insights (account_id bigint, handle text);
  `);
  psql(`
    insert into profile values (1, 'thee.suggs');
    insert into social_handles values (1, 'Thee.Suggs'), (1, 'powersuggs');
    insert into posts values
      (1, 'instagram', 'thee.suggs'),
      (1, 'instagram', 'THEE.SUGGS'),
      (1, 'reference', 'almashacklett'),
      (1, 'reference', 'almashacklett'),
      (1, 'reference', 'AlmaShacklett'),
      (1, 'reference', '_k.elsie'),
      (1, 'board', 'someoneelse'),
      (1, 'reference', ''),
      (1, 'reference', null),
      (2, 'reference', 'anotheraccountsperson');
    insert into insights values (1, 'jrealsuggs'), (1, 'almashacklett'), (1, 'powersuggs');
  `);

  // The exact query the app runs, read out of the app rather than retyped.
  const sqlFile = readFileSync("lib/leads/sql.ts", "utf8");
  const sql = /COLLECTED_HANDLES_SQL = `([\s\S]*?)`;/.exec(sqlFile)?.[1];
  check("the query could be read out of the app", Boolean(sql));
  if (!sql) throw new Error("no SQL found");

  const rows = psql(sql.replace(/\$1/g, "1"))
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [handle, source, posts] = line.split("|");
      return { handle, source, posts: Number(posts) };
    });
  const handles = rows.map((r) => r.handle);

  check(
    "his own handle is not offered as someone to recruit",
    !handles.includes("thee.suggs"),
    `found ${JSON.stringify(handles)}`,
  );
  check(
    "...including a connected account he never posts from",
    !handles.includes("powersuggs"),
    "powersuggs is his own, listed under social handles, and appears in a teardown row",
  );
  check(
    "someone saved three times under two spellings is one person",
    handles.filter((h) => h === "almashacklett").length === 1,
    `almashacklett appears ${handles.filter((h) => h === "almashacklett").length} times`,
  );
  check(
    "a handle saved with capitals matches one saved without",
    !handles.includes("AlmaShacklett"),
  );
  check(
    "someone found only in a teardown is still found",
    handles.includes("jrealsuggs"),
    `found ${JSON.stringify(handles)}`,
  );
  check(
    "someone saved to a board is found",
    handles.includes("someoneelse"),
  );
  check(
    "another account's people are not mixed in",
    !handles.includes("anotheraccountsperson"),
    "this is the one that would be a privacy problem rather than an annoyance",
  );
  check(
    "blank and missing handles are not listed as people",
    !handles.includes("") && !handles.includes(null),
  );
  check(
    "a person found two ways is credited to the more deliberate one",
    rows.find((r) => r.handle === "almashacklett")?.source === "teardown",
    `almashacklett came back as ${rows.find((r) => r.handle === "almashacklett")?.source}`,
  );
  check(
    "the count of saved posts is per person, not per row",
    rows.find((r) => r.handle === "almashacklett")?.posts === 4,
    `almashacklett shows ${rows.find((r) => r.handle === "almashacklett")?.posts} (3 posts and 1 teardown)`,
  );

  console.log("\n  The table itself");
  psql(readFileSync("migrations/0024_leads.sql", "utf8")
    .replace(/references accounts \(id\) on delete cascade/, "")
    .replace(/app_current_account\(\)/g, "1"));
  psql(`insert into leads (account_id, handle) values (1, 'someone')`);
  let rejected = false;
  try {
    psql(`insert into leads (account_id, handle) values (1, 'SomeOne')`);
  } catch { rejected = true; }
  check(
    "a handle with capitals cannot be stored, so one person cannot become two",
    rejected,
    "the check constraint should refuse anything that is not already lower case",
  );
  let duplicate = false;
  try {
    psql(`insert into leads (account_id, handle) values (1, 'someone')`);
  } catch { duplicate = true; }
  check("the same person cannot be added twice", duplicate);
  let badStatus = false;
  try {
    psql(`update leads set status = 'maybe' where handle = 'someone'`);
  } catch { badStatus = true; }
  check("a status outside the known set is refused", badStatus);
} finally {
  try { asClaude(`${PG}/pg_ctl -D ${data} stop -m immediate`); } catch {}
  try { rmSync(base, { recursive: true, force: true }); } catch {}
}

console.log(
  failures.length === 0
    ? `\nAll ${passed} checks passed.\n`
    : `\n${failures.length} FAILURE(S), ${passed} passed.\n`,
);
process.exit(failures.length === 0 ? 0 : 1);
