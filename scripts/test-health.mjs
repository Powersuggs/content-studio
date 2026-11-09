#!/usr/bin/env node
/**
 * The database check's judgement, against the real module.
 *
 * Every case here is a real state a database can be in, and the first
 * one is the state Aaron's was actually in tonight: protection switched
 * on for the accounts table with no rule attached, which made signing in
 * impossible and reported itself as a wrong password.
 *
 *   node scripts/test-health.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = mkdtempSync(join(tmpdir(), "health-"));
execFileSync("npx", ["tsc", "lib/health/expected.ts", "--outDir", out, "--module", "es2022",
  "--target", "es2022", "--moduleResolution", "bundler", "--noEmitOnError"],
  { cwd: ROOT, stdio: "pipe" });
const { judge, repairScript, MUST_BE_OPEN, MUST_BE_LOCKED } =
  await import(pathToFileURL(join(out, "expected.js")).href);

let f = 0;
const ok = (l, c, d) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${c ? "" : `\n          ${d}`}`);
  if (!c) f++;
};

const healthy = () => [
  ...MUST_BE_OPEN.map((t) => ({ table: t, present: true, rlsOn: false, forced: false, policies: 0 })),
  ...MUST_BE_LOCKED.map((t) => ({ table: t, present: true, rlsOn: true, forced: true, policies: 1 })),
];
const bad = (f) => f.filter((x) => x.severity !== "ok");

// A database that is as it should be.
const good = judge(healthy());
ok("a correct database reports nothing wrong", bad(good).length === 0,
  JSON.stringify(bad(good).map((x) => x.table)));
ok("and every table is still accounted for",
  good.length === MUST_BE_OPEN.length + MUST_BE_LOCKED.length, String(good.length));
ok("so there is no repair script", repairScript(good) === "", repairScript(good).slice(0, 60));

// THE BUG. Protection on accounts, no rule attached.
const locked = healthy().map((s) =>
  s.table === "accounts" ? { ...s, rlsOn: true, policies: 0 } : s);
const lockedOut = judge(locked);
const acc = lockedOut.find((x) => x.table === "accounts");
ok("THE STATE THAT BROKE SIGNING IN IS CAUGHT", acc.severity === "danger", JSON.stringify(acc));
ok("and it says what it actually breaks", /signing in/i.test(acc.says), acc.says);
ok("and it gives the one line that fixes it",
  acc.fix === "alter table accounts disable row level security;", String(acc.fix));

// A content table left wide open: the leak, not the breakage.
const openPosts = healthy().map((s) =>
  s.table === "posts" ? { ...s, rlsOn: false, forced: false, policies: 0 } : s);
const leak = judge(openPosts).find((x) => x.table === "posts");
ok("A CONTENT TABLE WITH NO PROTECTION IS CAUGHT", leak.severity === "danger", JSON.stringify(leak));
ok("and the fix switches it on, forces it, and adds the rule",
  /enable row level security/.test(leak.fix) &&
  /force row level security/.test(leak.fix) &&
  /create policy account_isolation/.test(leak.fix), leak.fix);

// Locked but not forced: protection that the owner role walks past.
const unforced = healthy().map((s) => (s.table === "photos" ? { ...s, forced: false } : s));
const soft = judge(unforced).find((x) => x.table === "photos");
ok("LOCKED BUT NOT FORCED IS CAUGHT", soft.severity === "danger", JSON.stringify(soft));
ok("and it says why that is not protection",
  /owner role walks straight past/.test(soft.says), soft.says);

// A missing table means a migration never ran.
const missing = healthy().filter((s) => s.table !== "newsletters");
const gone = judge(missing).find((x) => x.table === "newsletters");
ok("a missing table is reported, not skipped", gone && gone.severity !== "ok", JSON.stringify(gone));
ok("and it is not given SQL that would fail", gone.fix === null, String(gone.fix));

// The repair script has to be runnable as one block.
const several = judge(locked.map((s) =>
  s.table === "posts" ? { ...s, rlsOn: false, forced: false, policies: 0 } : s));
const script = repairScript(several);
ok("the repair script is wrapped in a transaction",
  script.startsWith("begin;") && script.trimEnd().endsWith("commit;"), script.slice(0, 40));
ok("and carries every fix", /disable row level security/.test(script) &&
  /create policy account_isolation on posts/.test(script), script.slice(0, 120));

ok("the two sign-in tables are the only ones expected to be open",
  MUST_BE_OPEN.length === 2 && MUST_BE_OPEN.includes("accounts") &&
  MUST_BE_OPEN.includes("email_verification_tokens"), JSON.stringify(MUST_BE_OPEN));
ok("and the content tables are all listed", MUST_BE_LOCKED.length === 20, String(MUST_BE_LOCKED.length));

console.log(f === 0 ? "\ndatabase check: all checks passed." : `\ndatabase check: ${f} FAILED.`);
process.exit(f === 0 ? 0 : 1);
