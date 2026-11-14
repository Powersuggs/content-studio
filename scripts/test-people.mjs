#!/usr/bin/env node
/**
 * Only the owner can set someone else's password.
 *
 * This panel hands out the ability to take over any account in the app,
 * so the thing worth proving is not that the button works. It is that
 * the button is not there for a member, AND that a member who calls the
 * action directly is refused anyway. Hiding a button is not a
 * permission, and the gap between those two is where this kind of
 * feature goes wrong.
 *
 * Driven through a real browser against a real database, because the
 * check reads a session cookie and there is no honest way to fake that
 * from outside a request.
 *
 *   BASE_URL=... SESSION_SECRET=... DATABASE_URL=... node scripts/test-people.mjs
 */
import { existsSync } from "node:fs";
import pg from "pg";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3101";
const { DATABASE_URL, SESSION_SECRET } = process.env;
if (!DATABASE_URL || !SESSION_SECRET) {
  console.error("DATABASE_URL and SESSION_SECRET must both be set");
  process.exit(1);
}

const PW = "/opt/npm-tools/node_modules/playwright/index.js";
let chromium;
try {
  ({ chromium } = (await import(existsSync(PW) ? PW : "playwright")).default ?? (await import(PW)));
} catch {
  console.log("\nPeople panel: SKIPPED (no Playwright).\n");
  process.exit(0);
}

let passed = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) { passed++; console.log(`  PASS  ${label}`); }
  else { failures.push(label); console.log(`  FAIL  ${label}${detail ? `\n          ${detail}` : ""}`); }
}

const db = new pg.Client({ connectionString: DATABASE_URL });
await db.connect();

const TAG = `ppl${Date.now()}`;
const OWNER_EMAIL = `${TAG}.owner@example.invalid`;
const MEMBER_EMAIL = `${TAG}.member@example.invalid`;
const OWNER_PASSWORD = "owner password here";
const MEMBER_PASSWORD = "member password here";
const made = [];
let browser;

/** The app's own hashing, so these accounts can really sign in. */
async function hash(password) {
  const { randomBytes, scrypt } = await import("node:crypto");
  const { promisify } = await import("node:util");
  const salt = randomBytes(16);
  const derived = await promisify(scrypt)(password, salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString("base64")}$${derived.toString("base64")}`;
}

/**
 * Sign in, then prove it by asking for a page that needs a session.
 *
 * Checking the URL straight after the submit measured the wrong moment:
 * the cookie arrives on the redirect response and the browser applies
 * it a beat later, so a successful sign-in still read as a bounce back
 * to /login. Asking for /dashboard afterwards is the honest test, and
 * it is what a person does next anyway.
 */
async function signIn(context, email, password) {
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForLoadState("networkidle");
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded" });
  return page;
}

try {
  for (const [email, password, role] of [
    [OWNER_EMAIL, OWNER_PASSWORD, "owner"],
    [MEMBER_EMAIL, MEMBER_PASSWORD, "member"],
  ]) {
    const { rows } = await db.query(
      `insert into accounts (email, password_hash, role, status, email_verified_at)
       values ($1, $2, $3, 'active', now()) returning id`,
      [email, await hash(password), role],
    );
    made.push(rows[0].id);
  }
  const [ownerId, memberId] = made;

  browser = await chromium.launch();

  console.log("\nWho can set someone else's password\n");

  // 1. The member.
  const memberCtx = await browser.newContext();
  const memberPage = await signIn(memberCtx, MEMBER_EMAIL, MEMBER_PASSWORD);
  check(
    "a member can sign in at all, so the rest of this means something",
    !memberPage.url().includes("/login"),
    memberPage.url(),
  );

  await memberPage.goto(`${BASE_URL}/settings`, { waitUntil: "networkidle" });
  const memberSees = await memberPage.innerText("body");
  check(
    "a member is not shown the people panel",
    !/New password/.test(memberSees),
    "the panel can take over any account in the app",
  );
  check(
    "a member is not shown the invite panel either",
    !/Create code/.test(memberSees),
  );
  check(
    "...but a member CAN change their own password",
    /Change my password/.test(memberSees),
    "otherwise a temporary password handed to them stays theirs forever",
  );

  // 2. The owner does a real reset, and the exact request that
  // performed it is captured on the way out.
  //
  // The previous version of this test guessed at server-action ids by
  // scraping hex strings out of the page and posting to each one. It
  // passed, and it proved nothing: removing the owner check entirely
  // left it still passing, because none of those guesses ever reached
  // the action. So the request is taken from the one that genuinely
  // worked, and replayed as the member.
  const ownerPage = await signIn(await browser.newContext(), OWNER_EMAIL, OWNER_PASSWORD);
  check(
    "the owner can still sign in with the password they had",
    !ownerPage.url().includes("/login"),
    ownerPage.url(),
  );
  await ownerPage.goto(`${BASE_URL}/settings`, { waitUntil: "networkidle" });
  const ownerSees = await ownerPage.innerText("body");
  check("the owner is shown the people panel", /New password/.test(ownerSees));
  check("...and sees the member in it", ownerSees.includes(MEMBER_EMAIL), ownerSees.slice(0, 200));

  let captured = null;
  await ownerPage.route("**/settings", async (route) => {
    const request = route.request();
    if (request.method() === "POST" && !captured) {
      captured = {
        url: request.url(),
        headers: await request.allHeaders(),
        body: request.postData() ?? "",
      };
    }
    await route.continue();
  });

  const row = ownerPage.locator("li", { hasText: MEMBER_EMAIL });
  await row.getByRole("button", { name: "New password" }).click();
  await row.getByRole("button", { name: "Yes", exact: true }).click();
  await ownerPage.waitForSelector("text=New password for", { timeout: 15000 });

  const shown = await ownerPage.innerText("body");
  const issued = /([A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4})/.exec(shown)?.[1];
  check("a new password is shown once", Boolean(issued), shown.slice(0, 300));
  check(
    "...with a warning that it will not be shown again",
    /only time it is shown/i.test(shown),
  );
  check(
    "the request that did it was captured, so it can be replayed",
    Boolean(captured?.headers?.["next-action"]),
    "without this the privilege check below is not actually tested",
  );

  console.log("\n  The same request, sent by a member");

  if (captured?.headers?.["next-action"]) {
    // Point it at the OWNER's account. If this works, a member has just
    // taken over the owner's login.
    const aimedAtOwner = captured.body.replace(String(memberId), String(ownerId));
    const { rows: before } = await db.query(
      "select password_hash from accounts where id = $1",
      [ownerId],
    );

    const replay = await memberPage.evaluate(
      async ({ url, headers, body }) => {
        const res = await fetch(url, { method: "POST", headers, body });
        return { status: res.status, text: (await res.text()).slice(0, 4000) };
      },
      { url: captured.url, headers: captured.headers, body: aimedAtOwner },
    );

    check(
      "a member replaying the owner's own request gets no password back",
      !/[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/.test(replay.text),
      `status ${replay.status}: ${replay.text.slice(0, 200)}`,
    );

    const { rows: after } = await db.query(
      "select password_hash from accounts where id = $1",
      [ownerId],
    );
    check(
      "...and the owner's password is exactly as it was",
      after[0].password_hash === before[0].password_hash,
      "a member just changed the owner's password",
    );

    const ownerStillIn = await signIn(await browser.newContext(), OWNER_EMAIL, OWNER_PASSWORD);
    check(
      "...so the owner can still sign in",
      !ownerStillIn.url().includes("/login"),
      ownerStillIn.url(),
    );
  }

  console.log("\n  What the reset actually did");

  if (issued) {
    const { rows: stored } = await db.query(
      "select password_hash from accounts where id = $1",
      [memberId],
    );
    check(
      "the password is not stored anywhere readable",
      !stored[0].password_hash.includes(issued),
      "it must be stored scrambled, never as the text that was shown",
    );

    const backIn = await signIn(await browser.newContext(), MEMBER_EMAIL, issued);
    check(
      "the member can sign in with the new password",
      !backIn.url().includes("/login"),
      backIn.url(),
    );
    const oldOne = await signIn(await browser.newContext(), MEMBER_EMAIL, MEMBER_PASSWORD);
    check(
      "...and their old password no longer works",
      oldOne.url().includes("/login"),
      oldOne.url(),
    );
  }
} finally {
  if (browser) await browser.close().catch(() => {});
  for (const id of made) await db.query("delete from accounts where id = $1", [id]).catch(() => {});
  await db.end().catch(() => {});
}

console.log(
  failures.length === 0
    ? `\nAll ${passed} checks passed.\n`
    : `\n${failures.length} FAILURE(S), ${passed} passed.\n`,
);
process.exit(failures.length === 0 ? 0 : 1);
