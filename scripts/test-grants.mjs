#!/usr/bin/env node
/**
 * The app's database role has to be able to use the tables.
 *
 * Every migration that creates a table ends with "grant ... if the
 * app_user role exists". That is correct on an install where the role
 * is already there and silently does nothing on one where it is not.
 * A migration runs once, so a role created afterwards never gets the
 * grants, and nothing ever retries.
 *
 * It does not fail at deploy time. It fails months later as a button
 * that errors. Creating an invite code was broken from the day the
 * feature shipped for exactly this reason, and the only way to find
 * out was to read the server logs.
 *
 * So this builds a database the wrong way round on purpose, proves the
 * hole is real, and then proves 0030 closes it.
 *
 *   node scripts/test-grants.mjs
 *
 * Builds its own throwaway database and removes it.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
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

const PG = "/usr/lib/postgresql/16/bin";
if (!existsSync(`${PG}/initdb`) || spawnSync("id", ["claude"]).status !== 0) {
  console.log("\nGrants: SKIPPED (no local Postgres).\n");
  process.exit(0);
}

const base = mkdtempSync(join(tmpdir(), "cs-grants-"));
const PORT = "5601";
const asClaude = (c) => execFileSync("su", ["claude", "-c", c], { encoding: "utf8" });
let n = 0;
const psql = (sql, db = "t") => {
  const f = join(base, `q${n++}.sql`);
  writeFileSync(f, sql, { mode: 0o644 });
  return asClaude(`${PG}/psql -h ${base} -p ${PORT} -U claude -d ${db} -tAq -v ON_ERROR_STOP=1 -f ${f}`);
};
const runMigration = (file) =>
  asClaude(`${PG}/psql -h ${base} -p ${PORT} -U claude -d t -q -v ON_ERROR_STOP=1 -f ${join(ROOT, "migrations", file)}`);

try {
  execFileSync("chmod", ["o+rx", base]);
  execFileSync("chown", ["-R", "claude", base]);
  asClaude(`${PG}/initdb -D ${base}/data -U claude --auth=trust`);
  asClaude(`${PG}/pg_ctl -D ${base}/data -o "-p ${PORT} -k ${base}" -l ${base}/log start -w`);
  asClaude(`${PG}/createdb -h ${base} -p ${PORT} -U claude t`);

  console.log("\nA database that drifted after the migrations ran\n");

  // The role first, because 0012 grants to it directly and the whole
  // file fails without it. A fresh install has to be set up in this
  // order, which is worth knowing on its own.
  psql(`create role app_user login`, "postgres");

  const files = readdirSync(join(ROOT, "migrations")).filter((f) => f.endsWith(".sql")).sort();
  const upTo30 = files.filter((f) => !f.startsWith("0030"));
  check("there are migrations to run", upTo30.length > 20, `${upTo30.length}`);

  let failedOn = null;
  for (const f of upTo30) {
    try { runMigration(f); } catch (e) { failedOn = `${f}: ${String(e.stderr ?? "").split("\n")[0]}`; break; }
  }
  check("every migration applies in order", failedOn === null, failedOn ?? "");

  // Now the state his real database was actually found in. Something
  // switched row security back on for the tables that are read before
  // a session exists, and the grants were not all there. Neither shows
  // up as an error until a person presses a button.
  psql(`alter table accounts enable row level security;
        alter table invite_codes enable row level security;
        revoke all on invite_codes from app_user;`);

  let codeInsert = null;
  try {
    psql(`set role app_user;
          insert into invite_codes (code, created_by, max_uses) values ('AAAA-BBBB-CCCC-DDDD', null, 1);`);
  } catch (e) {
    codeInsert = String(e.stderr ?? "").split("\n")[0];
  }
  check(
    "in that state the app cannot create an invite code",
    codeInsert !== null,
    "this is what he hit: press the button, get a server error, nothing stored",
  );
  check(
    "...and cannot look up an account to sign anyone in",
    psql(`select relrowsecurity from pg_class where relname = 'accounts'`).trim() === "t",
    "which is the login bug, same cause",
  );

  console.log("\n  After 0030");
  runMigration("0030_grants.sql");

  const missingAfter = psql(`
    select coalesce(string_agg(c.relname, ', ' order by c.relname), '') from pg_class c
      join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'public' and c.relkind = 'r'
       and not (has_table_privilege('app_user', c.oid, 'SELECT')
            and has_table_privilege('app_user', c.oid, 'INSERT')
            and has_table_privilege('app_user', c.oid, 'UPDATE')
            and has_table_privilege('app_user', c.oid, 'DELETE'))`).trim();
  check("every table is usable by the app's role", missingAfter === "", `still missing: ${missingAfter}`);

  // Read from pg_sequences rather than filtering pg_class by relkind.
  // Postgres may evaluate has_sequence_privilege before the relkind
  // filter, and it then errors on a toast table rather than skipping it.
  const seqs = psql(`
    select coalesce(string_agg(sequencename, ', ' order by sequencename), '')
      from pg_sequences
     where schemaname = 'public'
       and not has_sequence_privilege('app_user', quote_ident(schemaname) || '.' || quote_ident(sequencename), 'USAGE')`).trim();
  check("...and every sequence, or no row can be inserted at all", seqs === "", `missing: ${seqs}`);

  console.log("\n  The three that are read before anyone signs in");
  for (const t of ["accounts", "invite_codes", "email_verification_tokens"]) {
    check(
      `${t} is readable with no session`,
      psql(`select relrowsecurity from pg_class where relname = '${t}'`).trim() === "f",
      "signing in and redeeming a code both happen before there is an account to scope by",
    );
  }

  console.log("\n  And row security is still doing its job");
  const unforced = psql(`
    select coalesce(string_agg(c.relname, ', ' order by c.relname), '') from pg_class c
      join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'public' and c.relkind = 'r'
       and c.relname not in ('accounts','invite_codes','email_verification_tokens','data_deletion_requests')
       and exists (select 1 from pg_attribute a where a.attrelid = c.oid
                     and a.attname = 'account_id' and a.attnum > 0 and not a.attisdropped)
       and not (c.relrowsecurity and c.relforcerowsecurity)`).trim();
  check(
    "granting broadly did not unlock anyone's data",
    unforced === "",
    `not forced: ${unforced}. Grants say which TABLES the role may touch; row security says which ROWS`,
  );

  runMigration("0030_grants.sql");
  check("0030 can be run twice", true);
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
