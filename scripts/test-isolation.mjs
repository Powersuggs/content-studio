#!/usr/bin/env node
/**
 * Proves one account cannot see another account's data, through the real app.
 *
 * Builds two throwaway accounts with distinct, uniquely-tagged content, then
 * requests real pages as each account using a properly signed session cookie,
 * and asserts:
 *   - the viewer's OWN content appears (so the page really rendered data)
 *   - the OTHER account's content never appears
 *
 * Going over HTTP rather than importing the query functions means middleware,
 * session parsing, page rendering and the queries are all exercised together,
 * which is the thing that actually has to be safe.
 *
 *   BASE_URL=http://127.0.0.1:3101 \
 *   SESSION_SECRET='...' DATABASE_URL='...' \
 *   node scripts/test-isolation.mjs
 *
 * Creates its own accounts, deletes them at the end, never touches account 1.
 */
import { createHmac } from "node:crypto";
import pg from "pg";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3101";
const { DATABASE_URL, SESSION_SECRET } = process.env;
if (!DATABASE_URL || !SESSION_SECRET) {
  console.error("DATABASE_URL and SESSION_SECRET must both be set");
  process.exit(1);
}

function sessionCookie(accountId) {
  const expires = Date.now() + 30 * 24 * 3600 * 1000;
  const payload = `v2.${accountId}.${expires}`;
  const sig = createHmac("sha256", SESSION_SECRET)
    .update(payload)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `session=${payload}.${sig}`;
}

const db = new pg.Client({ connectionString: DATABASE_URL });
await db.connect();

let passed = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) {
    passed++;
    console.log(`    PASS  ${label}`);
  } else {
    failures.push(label);
    console.log(`    FAIL  ${label}${detail ? `  (${detail})` : ""}`);
  }
}

const TAG = `isotest${Date.now()}`;

async function makeAccount(label) {
  const handle = `${TAG}${label}handle`;
  const marker = `${TAG}${label}MARKER`;
  const { rows } = await db.query(
    `insert into accounts (email, password_hash, role, email_verified_at)
     values ($1, 'x', 'member', now()) returning id`,
    [`${TAG}.${label}@example.invalid`],
  );
  const id = rows[0].id;

  await db.query(
    `insert into profile (account_id, handle, display_name, timezone)
     values ($1, $2, $3, 'America/Phoenix')`,
    [id, handle, `${marker}name`],
  );
  const { rows: p } = await db.query(
    `insert into posts (account_id, platform, external_id, caption, handle, views, likes, posted_at, pillar)
     values ($1, 'instagram', $2, $3, $4, 4321, 210, current_date - 3, $5)
     returning id`,
    [id, `${TAG}${label}ext`, `${marker}caption`, handle, `${marker}pillar`],
  );
  const postId = p[0].id;

  await db.query(
    `insert into scripts (account_id, post_id, title, hook, body, status)
     values ($1, $2, $3, 'h', 'b', 'queued')`,
    [id, postId, `${marker}script`],
  );
  await db.query(`insert into boards (account_id, name) values ($1, $2)`, [id, `${marker}board`]);
  await db.query(
    `insert into insights (account_id, post_id, kind, content, handle)
     values ($1, $2, 'postmortem', $3, $4)`,
    [id, postId, `${marker}insight`, handle],
  );
  await db.query(
    `insert into lending_facts (account_id, fact, source_name, loan_type)
     values ($1, $2, 'src', 'VA')`,
    [id, `${marker}fact`],
  );

  return { id, label, handle, marker, cookie: sessionCookie(id) };
}

const PAGES = ["/dashboard", "/settings", "/scripts", "/boards", "/history", "/inspiration"];

/**
 * The severe failure is not two test accounts seeing each other. It is every
 * account seeing the OWNER's data, because `where id = 1` is hardcoded. A
 * test that only compares the two throwaway accounts misses it entirely: both
 * pages show the owner's rows, so neither contains the other's marker and the
 * check passes while the app is wide open. So we also assert the owner's own
 * content never appears for a different account.
 */
async function ownerSentinels() {
  const { rows } = await db.query(
    `select (select handle from profile where account_id = 1) as handle,
            (select caption from posts where account_id = 1 and caption is not null
              order by length(caption) desc limit 1) as caption`,
  );
  return [rows[0]?.handle, rows[0]?.caption].filter(
    (s) => typeof s === "string" && s.length > 8,
  );
}

console.log("\nAccount isolation test (through the running app)\n");

let a, b;
try {
  a = await makeAccount("alpha");
  b = await makeAccount("bravo");
  var owner = await ownerSentinels();
  console.log(`  account ${a.id} = alpha, account ${b.id} = bravo`);
  console.log(`  watching for ${owner.length} piece(s) of the owner's own content leaking\n`);

  let sawOwnDataAnywhere = false;

  for (const [viewer, other] of [[a, b], [b, a]]) {
    console.log(`  Viewing as account ${viewer.id} (${viewer.label}):`);
    for (const path of PAGES) {
      let html;
      try {
        const res = await fetch(`${BASE_URL}${path}`, {
          headers: { cookie: viewer.cookie },
          redirect: "follow",
        });
        html = await res.text();
      } catch (err) {
        check(`${path} loaded`, false, String(err?.message ?? err));
        continue;
      }
      if (html.includes(viewer.marker)) sawOwnDataAnywhere = true;
      check(
        `${path} hides ${other.label}'s data`,
        !html.includes(other.marker),
        `found "${other.marker}" in the page`,
      );
      const leakedFromOwner = owner.filter((s) => html.includes(s));
      check(
        `${path} hides the owner's data`,
        leakedFromOwner.length === 0,
        leakedFromOwner.length ? `found owner content: ${JSON.stringify(leakedFromOwner[0]).slice(0, 60)}` : "",
      );
    }
    console.log("");
  }

  check(
    "the viewer's own data actually rendered somewhere",
    sawOwnDataAnywhere,
    "no page contained the viewer's marker, so these pages may be empty and the test meaningless",
  );
} finally {
  if (a) await db.query("delete from accounts where id = $1", [a.id]);
  if (b) await db.query("delete from accounts where id = $1", [b.id]);
  await db.end();
}

console.log(
  failures.length === 0
    ? `\nAll ${passed} checks passed. No cross-account leakage.\n`
    : `\n${failures.length} LEAK(S), ${passed} passed.\n`,
);
process.exit(failures.length === 0 ? 0 : 1);
