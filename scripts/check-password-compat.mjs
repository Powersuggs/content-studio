#!/usr/bin/env node
/**
 * Proves lib/auth/password.ts and scripts/create-owner.mjs agree.
 * They hash passwords in two separate places; if they ever drift, the
 * owner would be locked out of their own app. Run this after touching
 * either file:
 *
 *   DATABASE_URL='...' node --experimental-strip-types scripts/check-password-compat.mjs
 */
import pg from "pg";
import { hashPassword, verifyPassword } from "../lib/auth/password.ts";

let failures = 0;
function check(label, passed) {
  console.log(`  ${passed ? "PASS" : "FAIL"}  ${label}`);
  if (!passed) failures++;
}

const PASSWORD = "correct horse battery staple";

console.log("\nPassword hashing cross-check\n");

// 1. The app's own round trip.
const appHash = await hashPassword(PASSWORD);
check("app hash verifies its own password", await verifyPassword(PASSWORD, appHash));
check("app hash rejects the wrong password", !(await verifyPassword("wrong password here", appHash)));
check("two hashes of the same password differ (salted)", appHash !== (await hashPassword(PASSWORD)));

// 2. The important one: can the app verify what the setup script stored?
if (process.env.DATABASE_URL) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const { rows } = await client.query("select password_hash from accounts where id = 1");
  await client.end();
  const stored = rows[0]?.password_hash;
  check("owner row has a password hash", Boolean(stored));
  if (stored) {
    check("app verifies the hash written by create-owner.mjs", await verifyPassword(PASSWORD, stored));
    check("app rejects a wrong password against it", !(await verifyPassword("not it", stored)));
    check("stored hash is not the password in plain text", !stored.includes(PASSWORD));
    check("stored hash uses the expected format", /^scrypt\$\d+\$\d+\$\d+\$[^$]+\$[^$]+$/.test(stored));
  }
} else {
  console.log("  SKIP  database checks (DATABASE_URL not set)");
}

// 3. Malformed input must return false, never throw.
for (const bad of [null, undefined, "", "garbage", "scrypt$x$y$z$a$b", "scrypt$16384$8$1$!!!$!!!"]) {
  check(`malformed hash ${JSON.stringify(bad)} returns false`, (await verifyPassword(PASSWORD, bad)) === false);
}

console.log(`\n${failures === 0 ? "All checks passed." : `${failures} CHECK(S) FAILED.`}\n`);
process.exit(failures === 0 ? 1 * 0 : 1);
