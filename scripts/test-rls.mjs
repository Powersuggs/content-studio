#!/usr/bin/env node
/**
 * Proves row-level security actually blocks, rather than merely being enabled.
 *
 * The scoping test proves the queries we wrote are correct. This proves the
 * database would stop a query we got WRONG, by running deliberately
 * unfiltered SQL -- the exact mistake a future change might make -- and
 * asserting it comes back empty.
 *
 *   DATABASE_URL='...' node scripts/test-rls.mjs
 *
 * Creates two throwaway accounts, checks, deletes them. Never touches
 * account 1's data.
 */
import pg from "pg";

// Two connections, as in production: ADMIN creates the fixtures (it is the
// migration-running role), APP is what the application actually connects as
// and is the one the policies must constrain. If they are the same role, the
// test still runs but says so, because a bypassing role proves nothing.
const { DATABASE_URL, ADMIN_DATABASE_URL } = process.env;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const db = new pg.Client({ connectionString: DATABASE_URL });
await db.connect();
const admin = new pg.Client({ connectionString: ADMIN_DATABASE_URL ?? DATABASE_URL });
await admin.connect();

let passed = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL  ${label}${detail ? `\n          ${detail}` : ""}`);
  }
}

const TAG = `rls${Date.now()}`;

/** Run SQL the way the app does: inside a transaction declaring an account. */
async function asAccount(accountId, sql, params = []) {
  await db.query("begin");
  try {
    await db.query("select set_config('app.account_id', $1, true)", [String(accountId)]);
    const r = await db.query(sql, params);
    await db.query("commit");
    return r.rows;
  } catch (err) {
    await db.query("rollback");
    throw err;
  }
}

/** Run SQL with no account declared at all. */
async function withNoAccount(sql, params = []) {
  await db.query("begin");
  try {
    const r = await db.query(sql, params);
    await db.query("commit");
    return r.rows;
  } catch (err) {
    await db.query("rollback");
    throw err;
  }
}

const who = await db.query(
  "select current_user as role, rolsuper, rolbypassrls from pg_roles where rolname = current_user",
);
const role = who.rows[0] ?? {};
console.log("\nRow-level security test\n");
console.log(`  app connects as: ${role.role}  (superuser: ${role.rolsuper}, bypassrls: ${role.rolbypassrls})`);
if (role.rolsuper || role.rolbypassrls) {
  console.log("  WARNING: this role bypasses row-level security entirely.");
  console.log("           Every check below is meaningless until that is fixed.\n");
} else {
  console.log("  Good: this role is subject to the policies.\n");
}

let a, b;
try {
  for (const label of ["alpha", "bravo"]) {
    const { rows } = await admin.query(
      `insert into accounts (email, password_hash, role, email_verified_at)
       values ($1, 'x', 'member', now()) returning id`,
      [`${TAG}.${label}@example.invalid`],
    );
    const id = rows[0].id;
    await admin.query(
      `insert into posts (account_id, platform, external_id, caption, handle, views)
       values ($1, 'instagram', $2, $3, $4, 1)`,
      [id, `${TAG}${label}`, `${TAG}${label}caption`, `${TAG}${label}`],
    );
    await admin.query(`insert into boards (account_id, name) values ($1, $2)`, [id, `${TAG}${label}board`]);
    if (label === "alpha") a = { id, label }; else b = { id, label };
  }
  console.log(`  account ${a.id} = alpha, account ${b.id} = bravo\n`);

  // 1. The mistake we are guarding against: a query with NO account filter.
  const unfiltered = await asAccount(a.id, "select caption from posts");
  check(
    "an unfiltered `select from posts` returns only your own rows",
    unfiltered.every((r) => !String(r.caption).includes("bravo")),
    `returned ${unfiltered.length} row(s) including another account's`,
  );
  check(
    "...and it does return your own, so the test is meaningful",
    unfiltered.some((r) => String(r.caption).includes("alpha")),
    "returned nothing at all, so this proves nothing",
  );

  // 2. Naming another account's id explicitly must still return nothing.
  const targeted = await asAccount(a.id, "select caption from posts where account_id = $1", [b.id]);
  check(
    "asking directly for another account's rows returns nothing",
    targeted.length === 0,
    `returned ${targeted.length} row(s)`,
  );

  // 3. A count, which is where a leak would show up as a wrong number.
  const counted = await asAccount(a.id, "select count(*)::int as n from boards");
  check(
    "count(*) over boards counts only your own",
    counted[0].n === 1,
    `counted ${counted[0].n}, expected 1`,
  );

  // 4. No account declared at all must see nothing, not everything.
  const anonymous = await withNoAccount("select count(*)::int as n from posts");
  check(
    "a query with no account declared sees no rows at all",
    anonymous[0].n === 0,
    `saw ${anonymous[0].n} row(s) -- policies are not failing closed`,
  );

  // 5. Writing into someone else's account must be refused.
  let blocked = false;
  try {
    await asAccount(a.id, `insert into boards (account_id, name) values ($1, $2)`, [b.id, `${TAG}stolen`]);
  } catch {
    blocked = true;
  }
  check("writing a row into another account is refused", blocked, "the insert succeeded");

  // 6. Updating another account's row must affect nothing.
  const updated = await asAccount(
    a.id,
    `update posts set caption = 'hijacked' where account_id = $1 returning id`,
    [b.id],
  );
  check("updating another account's rows changes nothing", updated.length === 0,
    `updated ${updated.length} row(s)`);

  // 7. FORCE is what makes all of the above true for the owner role.
  const forced = await db.query(
    `select count(*)::int as n from pg_class
      where relrowsecurity and relforcerowsecurity
        and relname in ('posts','insights','remakes','scripts','boards','board_posts',
                        'profile','auth','lending_facts','credit_ledger','render_jobs','assets')`,
  );
  check("all 12 tables have FORCE row level security", forced.rows[0].n === 12,
    `${forced.rows[0].n} of 12 -- without FORCE the owner bypasses every policy`);

  // 8. Login must still work, so accounts itself must NOT be locked.
  const loginable = await withNoAccount("select count(*)::int as n from accounts");
  check("the accounts table is still readable for signing in", loginable[0].n > 0,
    "signing in would be impossible");
} finally {
  for (const acct of [a, b]) {
    if (acct) await admin.query("delete from accounts where id = $1", [acct.id]);
  }
  await db.end();
  await admin.end();
}

console.log(
  failures.length === 0
    ? `\nAll ${passed} checks passed. The database enforces ownership itself.\n`
    : `\n${failures.length} FAILURE(S), ${passed} passed.\n`,
);
process.exit(failures.length === 0 ? 0 : 1);
