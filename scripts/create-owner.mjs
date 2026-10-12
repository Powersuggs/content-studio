#!/usr/bin/env node
/**
 * One-time setup: give the owner account an email and a password.
 *
 * Your existing Content Studio data was assigned to account 1 by
 * migration 0009. This script is how that account gets a login.
 *
 * Usage (never put the password on the command line, it would land in
 * your shell history):
 *
 *   OWNER_EMAIL='you@example.com' OWNER_PASSWORD='a long passphrase' \
 *   DATABASE_URL='...' node scripts/create-owner.mjs
 *
 * Re-running it on an account that already has a password is refused
 * unless you pass --force.
 */
import { randomBytes, scrypt as scryptCb } from "node:crypto";
import { promisify } from "node:util";
import pg from "pg";

const scrypt = promisify(scryptCb);

// Must stay identical to lib/auth/password.ts. scripts/check-password-compat.mjs
// proves the two agree; run it if you ever change either side.
const N = 16384, R = 8, P = 1, KEYLEN = 32, SALT_BYTES = 16;
const MIN_PASSWORD_LENGTH = 10;

async function hashPassword(password) {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scrypt(password, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

function fail(message) {
  console.error(`\n  ERROR: ${message}\n`);
  process.exit(1);
}

const force = process.argv.includes("--force");
const email = (process.env.OWNER_EMAIL ?? "").trim().toLowerCase();
const password = process.env.OWNER_PASSWORD ?? "";
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) fail("DATABASE_URL is not set.");
if (!email) fail("OWNER_EMAIL is not set.");
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(`"${email}" does not look like an email address.`);
if (password.length < MIN_PASSWORD_LENGTH) {
  fail(`OWNER_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters (yours is ${password.length}).`);
}

const client = new pg.Client({ connectionString: databaseUrl });

try {
  await client.connect();

  const { rows: existing } = await client.query(
    "select id, email, password_hash from accounts where id = 1",
  );
  if (existing.length === 0) {
    fail("There is no account with id 1. Did migration 0009_accounts.sql run against this database?");
  }
  if (existing[0].password_hash && !force) {
    fail(
      `Account 1 already has a password (email: ${existing[0].email ?? "none"}).\n` +
      `  Re-run with --force only if you intend to replace it.`,
    );
  }

  const { rows: clash } = await client.query(
    "select id from accounts where lower(email) = $1 and id <> 1",
    [email],
  );
  if (clash.length > 0) fail(`Another account (id ${clash[0].id}) already uses ${email}.`);

  const passwordHash = await hashPassword(password);

  await client.query("begin");
  await client.query(
    `update accounts
        set email = $1,
            password_hash = $2,
            email_verified_at = coalesce(email_verified_at, now()),
            role = 'owner',
            updated_at = now()
      where id = 1`,
    [email, passwordHash],
  );
  // Make sure the owner has a profile row to hang settings off.
  await client.query(
    `insert into profile (account_id)
     select 1 where not exists (select 1 from profile where account_id = 1)`,
  );
  await client.query("commit");

  const { rows: counts } = await client.query(
    `select (select count(*) from posts         where account_id = 1) as posts,
            (select count(*) from scripts       where account_id = 1) as scripts,
            (select count(*) from boards        where account_id = 1) as boards,
            (select count(*) from lending_facts where account_id = 1) as lending_facts`,
  );
  const c = counts[0];

  console.log(`
  Owner account ready.

    email        ${email}
    password     set (stored as a scrypt hash, not the password itself)
    role         owner

  This account now owns your existing work:

    posts          ${c.posts}
    scripts        ${c.scripts}
    boards         ${c.boards}
    lending facts  ${c.lending_facts}
`);
} catch (err) {
  try { await client.query("rollback"); } catch {}
  fail(err instanceof Error ? err.message : String(err));
} finally {
  await client.end();
}
