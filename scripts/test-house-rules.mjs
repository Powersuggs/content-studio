/**
 * The house rules, run against the real module.
 *
 * Compiles lib/writing/house-rules.ts and imports what actually ships. An
 * earlier test in this project hand-copied the logic it was checking, the
 * copy drifted, and it reported a fix as working while the real code was
 * broken. Never again: if it is worth testing it is worth testing the
 * thing itself.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const out = mkdtempSync(join(tmpdir(), "house-rules-"));

execFileSync(
  "npx",
  ["tsc", "lib/writing/house-rules.ts", "--outDir", out, "--module", "es2022",
   "--target", "es2022", "--moduleResolution", "bundler"],
  { cwd: ROOT, stdio: "pipe" },
);

const mod = await import(pathToFileURL(join(out, "house-rules.js")).href);
const { applyHouseRules, unDash, retireOldNames, HOUSE_RULES, BRAND } = mod;

let failed = 0;
const check = (label, got, want) => {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) {
    console.log(`        want: ${JSON.stringify(want)}`);
    console.log(`        got:  ${JSON.stringify(got)}`);
  }
};
const truthy = (label, got) => {
  if (!got) failed++;
  console.log(`${got ? "PASS" : "FAIL"}  ${label}`);
};

const EM = "—";
const EN = "–";

// ---------------------------------------------------------------- dashes
check(
  "THE CAPTION HE CAUGHT COMES BACK WITHOUT AN EM DASH",
  applyHouseRules(
    `Top producers and agents thinking about a switch ${EM} this one's for you.`,
  ),
  "Top producers and agents thinking about a switch, this one's for you.",
);
check("an en dash goes too", unDash(`faith ${EN} family ${EN} fitness`),
  "faith, family, fitness");
check("a double hyphen standing in for one goes too",
  unDash("the split -- not the market -- is the problem"),
  "the split, not the market, is the problem");
check("a dash with no spaces around it still goes",
  unDash(`one thing${EM}discipline`), "one thing, discipline");
check("a span of numbers keeps a tight hyphen, not a comma",
  unDash(`6${EN}8 slides`), "6-8 slides");
check("a span with spaces too", unDash(`$20 ${EN} 40K`), "$20-40K");
check("a hyphen inside a word is left alone",
  unDash("first-time zero-down buyers"), "first-time zero-down buyers");
check("no comma is added where the sentence is already punctuated",
  unDash(`stop waiting. ${EM} build the discipline`),
  "stop waiting. build the discipline");
check("a dash opening a line was decoration and simply goes",
  unDash(`Faith.\n${EM} Family.`), "Faith.\nFamily.");
check("a dash closing a line goes without leaving a comma",
  unDash(`Faith ${EM}\nFamily.`), "Faith\nFamily.");
check("a dash at the very end goes", unDash(`we are just getting started ${EM}`),
  "we are just getting started");
check("two lines are never welded into one",
  unDash(`line one\nline two`), "line one\nline two");

// ------------------------------------------------------------------ links
check(
  "A DOUBLE HYPHEN INSIDE A LINK IS NEVER TOUCHED",
  applyHouseRules("book here https://example.com/a--b?x=1 today"),
  "book here https://example.com/a--b?x=1 today",
);
check("and the text around the link is still cleaned",
  applyHouseRules(`go now ${EM} https://example.com/a--b ${EM} it is free`),
  "go now, https://example.com/a--b, it is free");

// ------------------------------------------------------------------ names
check("THE RETIRED NAME NEVER SURVIVES", retireOldNames("At Rise Up Realty, we build."),
  "At Rise Up Team, we build.");
check("the hashtag form too", retireOldNames("#RiseUpRealty #YumaAZ"),
  "#RiseUpTeam #YumaAZ");
check("a shouting headline stays shouting",
  retireOldNames("RISE UP REALTY IS HIRING"), "RISE UP TEAM IS HIRING");
check("a lowercase post stays lowercase",
  retireOldNames("we are rise up realty"), "we are rise up team");
check("the run-together form", retireOldNames("RiseUpRealty"), "RiseUpTeam");
check("the live name is left exactly as it is",
  retireOldNames("Rise Up Team | eXp Realty"), "Rise Up Team | eXp Realty");
check("eXp Realty is not mistaken for the retired name",
  retireOldNames("Johanna is with eXp Realty"), "Johanna is with eXp Realty");

// ------------------------------------------------------------------- JSON
const json = JSON.stringify({
  title: `Have you hit your ceiling${EM}already?`,
  caption: "A switch " + EM + " this one's for you. #RiseUpRealty",
});
const cleaned = applyHouseRules(json);
let parsed = null;
try { parsed = JSON.parse(cleaned); } catch { /* left null */ }
truthy("A CLEANED JSON RESPONSE IS STILL VALID JSON", parsed !== null);
check("and the fields inside it were cleaned", parsed?.caption,
  "A switch, this one's for you. #RiseUpTeam");

// ------------------------------------------------------------------ prompt
truthy("the prompt block states the real R.I.S.E. expansion",
  HOUSE_RULES.includes("Reach, Influence, Scale, Elevate"));
truthy("and allows the second word he also uses",
  HOUSE_RULES.includes("Impact"));
truthy("the prompt block names the retired name so the model avoids it",
  HOUSE_RULES.includes("Rise Up Realty"));
truthy("the prompt block names the live team",
  HOUSE_RULES.includes("Rise Up Team"));
check("R.I.S.E. is four words", BRAND.rise.length, 4);
check("with one alternate for the second", BRAND.riseAlternate, "Impact");

console.log(
  failed === 0 ? "\nhouse rules: all checks passed." : `\nhouse rules: ${failed} FAILED.`,
);
process.exit(failed === 0 ? 0 : 1);
