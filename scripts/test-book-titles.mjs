#!/usr/bin/env node
/**
 * The title suggester has to survive the model answering it badly.
 *
 * Two things are being proved here.
 *
 * First, the normalizer. The whole point of this feature is that a title
 * and a subtitle are two separate strings, and the single most likely way
 * for a model to answer is "Title: Subtitle" crammed into the title field,
 * because that is how titles are written everywhere it has ever read one.
 * If that slips through, the subtitle box stays empty and the title box
 * gets a colon in it, which is exactly the thing he asked to be fixed.
 *
 * Second, the compliance rule. He is a licensed loan officer. The pattern
 * these suggestions are modelled on includes "How Anyone Can Get Rich
 * Starting From Anywhere", and he cannot say that. So a subtitle that
 * promises money must come back MARKED and must NOT come back deleted:
 * deleting it silently would mean he never learns the rule exists and
 * cannot argue with it when it is wrong.
 *
 *   node scripts/test-book-titles.mjs
 *
 * Pure. No database and no network. Skips with a note if esbuild is
 * unavailable.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

let passed = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) { passed++; console.log(`  PASS  ${label}`); }
  else { failures.push(label); console.log(`  FAIL  ${label}${detail ? `\n          ${detail}` : ""}`); }
}

const bundleDir = mkdtempSync(join(tmpdir(), "cs-titles-js-"));
let mod;
try {
  writeFileSync(
    join(bundleDir, "entry.ts"),
    `export * from "${pathToFileURL(join(ROOT, "lib/books/titles.ts")).pathname}";`,
  );
  const built = spawnSync("npx", ["--yes", "esbuild", join(bundleDir, "entry.ts"),
    "--bundle", "--format=esm", "--platform=node", `--outfile=${join(bundleDir, "out.mjs")}`],
    { encoding: "utf8" });
  if (built.status !== 0) {
    console.log("\nBook titles: SKIPPED (esbuild could not bundle).\n");
    process.exit(0);
  }
  mod = await import(pathToFileURL(join(bundleDir, "out.mjs")).href);
} catch {
  console.log("\nBook titles: SKIPPED (could not build).\n");
  process.exit(0);
}
const {
  normalizeTitles, riskyPromise, titlesUserPrompt,
  TITLES_SYSTEM, TITLES_SHAPE, JOB_LABEL, SUBTITLE_JOBS,
} = mod;

const ok = (title, subtitle, extra = {}) => ({
  title, subtitle, job: "objection", why: "because", ...extra,
});

// ---- the normalizer ------------------------------------------------
console.log("\nCleaning up what the model sends back\n");

{
  const [idea] = normalizeTitles({
    ideas: [{ title: "Trash Man to Cash Man: How Anyone Starts Over", subtitle: "", job: "objection", why: "w" }],
  });
  check(
    '"Title: Subtitle" in one field is split into two',
    idea && idea.title === "Trash Man to Cash Man" &&
      idea.subtitle === "How Anyone Starts Over",
    JSON.stringify(idea),
  );
}

{
  const [idea] = normalizeTitles({
    ideas: [{ title: "Boss Moves: ignore me", subtitle: "The real subtitle that came back", job: "proof", why: "w" }],
  });
  check(
    "a colon is still split off even when a real subtitle came back",
    idea && idea.title === "Boss Moves" &&
      idea.subtitle === "The real subtitle that came back",
    JSON.stringify(idea),
  );
}

{
  const got = normalizeTitles({ ideas: [{ title: "The Quiet Close", subtitle: "", job: "objection" }] });
  check("a title with no subtitle at all is dropped", got.length === 0, JSON.stringify(got));
}

{
  const [idea] = normalizeTitles({ ideas: [ok('"The Quiet Close"', "Sub")] });
  check(
    "quotes the model wrapped around the title are stripped",
    idea && idea.title === "The Quiet Close",
    JSON.stringify(idea),
  );
}

{
  const long = "A Really Very Long Title That Goes On Past Any Reasonable Cover";
  const got = normalizeTitles({ ideas: [ok(long, "Sub")] });
  check("a title too long for a cover is dropped", got.length === 0, `${long.length} chars`);
}

for (const weak of ["Mastering the Close", "Navigating Your Split", "Understanding Rates"]) {
  const got = normalizeTitles({ ideas: [ok(weak, "Sub")] });
  check(`"${weak.split(" ")[0]}" as a first word is dropped`, got.length === 0, JSON.stringify(got));
}

{
  const got = normalizeTitles({
    ideas: [ok("The Quiet Close", "One"), ok("the quiet close", "Two")],
  });
  check(
    "the same title twice in different case is one suggestion",
    got.length === 1,
    JSON.stringify(got.map((g) => g.title)),
  );
}

{
  const nine = Array.from({ length: 9 }, (_, i) => ok(`Title Number ${i}`, "Sub"));
  check("never more than six come back", normalizeTitles({ ideas: nine }).length === 6);
}

{
  const [idea] = normalizeTitles({ ideas: [ok("The Quiet Close", "Sub", { job: "nonsense" })] });
  check(
    "an unknown job falls back to objection rather than through",
    idea && SUBTITLE_JOBS.includes(idea.job) && idea.job === "objection",
    JSON.stringify(idea),
  );
}

{
  const [idea] = normalizeTitles({ ideas: [ok("The Quiet Close", "Sub", { job: "proof" })] });
  check('job "proof" survives', idea && idea.job === "proof", JSON.stringify(idea));
}

check("garbage in gives an empty list, not a crash", normalizeTitles(null).length === 0);
check("a missing ideas array gives an empty list", normalizeTitles({ nope: 1 }).length === 0);
check(
  "a non-object inside the list is skipped, not fatal",
  normalizeTitles({ ideas: [null, "x", 7, ok("The Quiet Close", "Sub")] }).length === 1,
);
check(
  "every job has a label for the page to show",
  SUBTITLE_JOBS.every((j) => typeof JOB_LABEL[j] === "string" && JOB_LABEL[j].length > 0),
);

// ---- the compliance rule -------------------------------------------
console.log("\nPromises he is not licensed to make\n");

const MUST_FLAG = [
  "How Anyone Can Get Rich Starting From Anywhere",
  "The path to financial freedom for agents",
  "How to build wealth on a small book of business",
  "The six figure year, explained",
  "How agents earn more without working more",
  "A guaranteed way to read a rate sheet",
  "The risk free way to change brokerage",
  "How to double your closings this year",
  "Save $400 a month on the same house",
  "Why a 7% rate is not the problem",
  "How to make money in a slow market",
  "Building passive income from referrals",
];
for (const sub of MUST_FLAG) {
  const hit = riskyPromise(sub);
  check(`flagged: "${sub.slice(0, 44)}"`, typeof hit === "string" && hit.length > 0, String(hit));
}

const MUST_NOT_FLAG = [
  "What every agent gets wrong about the commission conversation",
  "How to read a mortgage statement without calling anyone",
  "For the agent who has read every script and still freezes",
  "Why your credit score is not the whole story",
  "What the 2008 crash taught the people who stayed",
  "Learn more about the close in one sitting",
  "The questions buyers are too embarrassed to ask",
];
for (const sub of MUST_NOT_FLAG) {
  const hit = riskyPromise(sub);
  check(`not flagged: "${sub.slice(0, 44)}"`, hit === null, String(hit));
}

{
  const [idea] = normalizeTitles({
    ideas: [ok("Trash to Cash", "How Anyone Can Get Rich Starting From Anywhere")],
  });
  check(
    "a risky suggestion is MARKED, not silently deleted",
    idea !== undefined && typeof idea.risky === "string" && idea.risky.length > 0,
    JSON.stringify(idea),
  );
}

{
  const [idea] = normalizeTitles({ ideas: [ok("The Quiet Close", "What every agent gets wrong")] });
  check(
    "a clean suggestion carries no warning",
    idea && idea.risky === undefined,
    JSON.stringify(idea),
  );
}

// ---- the prompt ----------------------------------------------------
console.log("\nWhat the model is actually told\n");

check(
  "the system prompt forbids promising money",
  /never promise/i.test(TITLES_SYSTEM) && /get(ting)? rich|income|wealth/i.test(TITLES_SYSTEM),
);
check(
  "the system prompt says what it MAY promise, not only what it may not",
  /you may promise/i.test(TITLES_SYSTEM),
);
check(
  "both subtitle jobs are described",
  /objection:/i.test(TITLES_SYSTEM) && /proof:/i.test(TITLES_SYSTEM),
);
check("the title is forbidden a colon", /no colon/i.test(TITLES_SYSTEM));
check("inventing a credential is forbidden", /do not invent/i.test(TITLES_SYSTEM));
check("the no dash house rule is restated", /dash/i.test(TITLES_SYSTEM));
check(
  "the shape it must return names both fields and the job",
  /"title"/.test(TITLES_SHAPE) && /"subtitle"/.test(TITLES_SHAPE) && /"job"/.test(TITLES_SHAPE),
);

{
  const prompt = titlesUserPrompt({
    premise: "Agents ask about the split first and it is the least important number.",
    audience: "Agents thinking about leaving their brokerage",
    currentTitle: "Split Decisions",
    material: ["I have closed loans for 9 years"],
  });
  check("the premise reaches the prompt", prompt.includes("least important number"));
  check("the audience reaches the prompt", prompt.includes("leaving their brokerage"));
  check("his own material reaches the prompt", prompt.includes("9 years"));
  check(
    "the title he already has is sent, so it is not handed back to him",
    prompt.includes("Split Decisions") && /do not return this back/i.test(prompt),
  );
  check(
    "it asks for a spread across both jobs, not six of one",
    /four with job "objection"/i.test(prompt) && /two with job "proof"/i.test(prompt),
  );
  check(
    "it says what to do when there is no real credential to point at",
    /without inventing|inventing a credential/i.test(prompt),
  );
}

{
  const prompt = titlesUserPrompt({ audience: "Agents" });
  check(
    "no premise still builds a prompt, and says the argument is missing",
    typeof prompt === "string" && /not said yet/i.test(prompt),
  );
}

try { rmSync(bundleDir, { recursive: true, force: true }); } catch {}

console.log(
  failures.length === 0
    ? `\nAll ${passed} checks passed.\n`
    : `\n${failures.length} FAILURE(S), ${passed} passed.\n`,
);
process.exit(failures.length === 0 ? 0 : 1);
