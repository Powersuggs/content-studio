#!/usr/bin/env node
/**
 * An invite code has to actually produce a working, separate account.
 *
 * This is a regression test for a real state the app shipped in: the
 * Create code button in Settings worked, codes were generated and
 * stored, and the signup page was switched off in middleware. So every
 * code handed out was useless, and the person it was given to landed on
 * the login screen with no way to make an account. Nothing errored.
 * Nothing logged. The owner had no way to find out except by asking the
 * person why they never signed up.
 *
 * So this goes through the front door, over HTTP, the way a real
 * invited person does.
 *
 *   BASE_URL=http://127.0.0.1:3101 \
 *   SESSION_SECRET='...' DATABASE_URL='...' \
 *   node scripts/test-signup.mjs
 *
 * Creates its own accounts and codes, removes them at the end.
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3101";
const { DATABASE_URL, SESSION_SECRET } = process.env;
if (!DATABASE_URL || !SESSION_SECRET) {
  console.error("DATABASE_URL and SESSION_SECRET must both be set");
  process.exit(1);
}

let passed = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) { passed++; console.log(`  PASS  ${label}`); }
  else { failures.push(label); console.log(`  FAIL  ${label}${detail ? `\n          ${detail}` : ""}`); }
}

const db = new pg.Client({ connectionString: DATABASE_URL });
await db.connect();

const TAG = `sgn${Date.now()}`;
const created = [];

/** A POST of form fields, not following redirects, like a browser form. */
async function post(path, fields) {
  const body = new URLSearchParams(fields);
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    redirect: "manual",
  });
  return {
    status: res.status,
    location: res.headers.get("location") ?? "",
    cookie: res.headers.get("set-cookie") ?? "",
  };
}

try {
  console.log("\nMaking an account from an invite code\n");

  // The signup page has to be reachable by someone with no session at all.
  const page = await fetch(`${BASE_URL}/signup`, { redirect: "manual" });
  check(
    "the signup page opens for someone who is not signed in",
    page.status === 200,
    `got ${page.status} to ${page.headers.get("location") ?? "(no redirect)"} -- this is the exact failure that made every invite code useless`,
  );
  const html = page.status === 200 ? await page.text() : "";
  check("...and it asks for the invite code", /invite code/i.test(html), html.slice(0, 200));

  // An owner to issue the code from.
  const { rows: owners } = await db.query(
    `insert into accounts (email, password_hash, role, status, email_verified_at)
     values ($1, 'x', 'owner', 'active', now()) returning id`,
    [`${TAG}.owner@example.invalid`],
  );
  const ownerId = owners[0].id;
  created.push(ownerId);

  // The code's shape is read out of the app, not guessed. Codes are
  // stored grouped with dashes, and a test that inserted an ungrouped one
  // failed for its own reason rather than the app's, which is the most
  // expensive kind of wrong test.
  const invites = readFileSync(join(ROOT, "lib/auth/invites.ts"), "utf8");
  const alphabet = /const ALPHABET = "([^"]+)"/.exec(invites)[1];
  const length = Number(/const CODE_LENGTH = (\d+)/.exec(invites)[1]);
  const group = Number(/const GROUP = (\d+)/.exec(invites)[1]);
  let raw = "";
  for (let i = 0; i < length; i++) raw += alphabet[(Date.now() + i * 7) % alphabet.length];
  const code = raw.match(new RegExp(`.{1,${group}}`, "g")).join("-");
  await db.query(
    `insert into invite_codes (code, created_by, note, max_uses) values ($1, $2, 'test', 1)`,
    [code, ownerId],
  );

  // The real thing: redeem it.
  const email = `${TAG}.invited@example.invalid`;
  const signup = await post("/api/signup", {
    code,
    email,
    password: "a decent password here",
    confirm: "a decent password here",
  });
  check(
    "signing up with a good code works",
    signup.status === 303 && !signup.location.includes("error"),
    `${signup.status} -> ${signup.location}`,
  );
  check(
    "...and lands them inside the app, not back on a form",
    !signup.location.includes("/signup") && !signup.location.includes("/login"),
    signup.location,
  );
  check("...with a session cookie", /session=/.test(signup.cookie), signup.cookie.slice(0, 60));

  const { rows: made } = await db.query(
    `select id, role, password_hash is not null as has_password, invited_with
       from accounts where lower(email) = $1`,
    [email],
  );
  check("the account really exists", made.length === 1, JSON.stringify(made));
  if (made[0]) created.push(made[0].id);
  check("it is a member, not another owner", made[0]?.role === "member", made[0]?.role);
  check("it has a password of its own", made[0]?.has_password === true);
  check("it records which code let them in", made[0]?.invited_with === code, made[0]?.invited_with);

  // The code was for one person.
  const second = await post("/api/signup", {
    code,
    email: `${TAG}.second@example.invalid`,
    password: "another decent password",
    confirm: "another decent password",
  });
  check(
    "a one-use code cannot be used twice",
    second.location.includes("error=code"),
    second.location,
  );
  const { rows: leftovers } = await db.query(
    `select id from accounts where lower(email) = $1`,
    [`${TAG}.second@example.invalid`],
  );
  check("...and no account was made for the second person", leftovers.length === 0);

  const madeUp = await post("/api/signup", {
    code: "ZZZZ-ZZZZ-ZZZZ-ZZZZ",
    email: `${TAG}.third@example.invalid`,
    password: "another decent password",
    confirm: "another decent password",
  });
  check("an invented code is refused", madeUp.location.includes("error=code"), madeUp.location);

  const taken = await post("/api/signup", {
    code,
    email,
    password: "another decent password",
    confirm: "another decent password",
  });
  check("an email that already has an account is refused", taken.location.includes("error="), taken.location);

  console.log("\n  What the form tells people");

  // Read off the rendered page, not the source file. The source
  // explains in a comment WHY there is no "avoid special characters"
  // rule, and checking the source made that explanation trip the check
  // that exists to keep the rule out.
  // React splits a line like "At least {N} characters" into separate
  // nodes with comment markers between them, so those are stripped
  // before matching. Otherwise the test fails on text that reads
  // perfectly well on screen.
  const form = (await (await fetch(`${BASE_URL}/signup`)).text())
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s+/g, " ");
  check(
    "it never tells people to avoid certain characters",
    !/no special characters|letters and numbers only|avoid symbols/i.test(form),
    "every character is accepted here, so a rule like that would only make their passwords weaker for no reason",
  );
  check(
    "it says every kind of character is fine",
    /Any letters, numbers or symbols/.test(form),
    form.includes("At least") ? "the hint is there but does not say this" : "no hint at all",
  );
  check(
    "it gives the real minimum as a number",
    /At least 10 characters/.test(form),
  );
  check(
    "it pushes length, which is the thing that actually helps",
    /A few words strung together/.test(form),
  );
  check(
    "it says the code's dashes and capitals do not matter",
    /Dashes and capitals do not matter/.test(form),
    "the code is tidied before it is checked, and saying so saves people retyping one that would have worked",
  );

  console.log("\n  Signing in afterwards");

  const signin = await post("/api/login", { email, password: "a decent password here" });
  check(
    "the new account can sign in with its own email and password",
    signin.status === 303 && !signin.location.includes("/login"),
    `${signin.status} -> ${signin.location}`,
  );
  const wrong = await post("/api/login", { email, password: "not the password" });
  check("the wrong password does not", wrong.location.includes("/login"), wrong.location);

  console.log("\n  The shared password is gone");

  const shared = await post("/api/login", { email: "", password: process.env.APP_PASSWORD ?? "whatever-it-was" });
  check(
    "a blank email with any password is refused",
    shared.location.includes("/login"),
    `${shared.location} -- the old shared-password door must be shut`,
  );
  const loginHtml = await (await fetch(`${BASE_URL}/login`)).text();
  check(
    "the login page no longer tells people to leave the email blank",
    !/leave the email blank/i.test(loginHtml),
  );
  check(
    "...and tells an invited person where their code goes",
    /invite code/i.test(loginHtml),
    "a code with no instructions is a code nobody redeems",
  );
  const middleware = readFileSync(join(ROOT, "middleware.ts"), "utf8");
  check(
    "a path cannot be both public and retired",
    /is both public and retired/.test(middleware),
    "public is checked first, so a path in both lists is silently public and the retirement does nothing, which is exactly how signup ended up switched off while codes were being issued",
  );
  check(
    "the old claim screen is gone rather than 404",
    (await fetch(`${BASE_URL}/setup`, { redirect: "manual" })).headers.get("location")?.includes("/login") ?? false,
  );
} finally {
  for (const id of created) {
    await db.query("delete from accounts where id = $1", [id]).catch(() => {});
  }
  await db.query("delete from invite_codes where note = 'test'").catch(() => {});
  await db.end();
}

console.log(
  failures.length === 0
    ? `\nAll ${passed} checks passed.\n`
    : `\n${failures.length} FAILURE(S), ${passed} passed.\n`,
);
process.exit(failures.length === 0 ? 0 : 1);
