#!/usr/bin/env node
/**
 * A news reaction is the one place an unverified number gets near the
 * output, so this is about where that line is drawn.
 *
 * Everywhere else the rule is flat: never state a figure that is not in
 * his verified facts. News is inherently about a figure somebody else
 * reported, so flat would make the feature impossible and loose would let
 * a licensed lender publish a rate he has not checked as his own claim.
 * The line is attribution, and a figure that appears in the draft without
 * appearing anywhere in what he gave it is the failure worth catching.
 *
 *   node scripts/test-news.mjs
 *
 * Needs esbuild. Skips with a note if it cannot bundle the module.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
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

const dir = mkdtempSync(join(tmpdir(), "cs-news-"));
let mod;
try {
  writeFileSync(join(dir, "entry.ts"),
    `export * from "${pathToFileURL(join(ROOT, "lib/news/prompt.ts")).pathname}";`);
  const built = spawnSync("npx", ["--yes", "esbuild", join(dir, "entry.ts"), "--bundle",
    "--format=esm", "--platform=node", `--outfile=${join(dir, "out.mjs")}`], { encoding: "utf8" });
  if (built.status !== 0) {
    console.log("\nNews reaction: SKIPPED (esbuild could not bundle the module).\n");
    process.exit(0);
  }
  mod = await import(pathToFileURL(join(dir, "out.mjs")).href);
} catch {
  console.log("\nNews reaction: SKIPPED (could not build the module).\n");
  process.exit(0);
}
const { NEWS_SYSTEM, newsUserPrompt, normalizeNews, unsourcedFigures } = mod;

console.log("\nThe line on numbers\n");

check(
  "a figure from the article may only appear attributed",
  /ONLY as something the article or the named source said/i.test(NEWS_SYSTEM),
);
check(
  "...in the same sentence, not somewhere further down",
  /attributed in the same sentence/i.test(NEWS_SYSTEM),
  "attribution in a different paragraph is not attribution a reader connects",
);
check(
  "doing arithmetic on the article's figure is forbidden",
  /Never do arithmetic on a figure from the article/i.test(NEWS_SYSTEM),
  "turning a rate into a payment presents a derived number as his own, which is the thing attribution was protecting against",
);
check(
  "...including the specific case of a rate becoming a payment",
  /turn a rate into a payment/i.test(NEWS_SYSTEM),
);
check(
  "adding a figure the article did not have is forbidden",
  /Never add a figure the article did not contain/i.test(NEWS_SYSTEM),
);
check(
  "writing with no figures at all is named as normal",
  /This is normal and the piece is usually better for it/i.test(NEWS_SYSTEM),
  "a model with no acceptable empty option invents a number",
);
check(
  "confident prediction is refused but watching is allowed",
  /is what I would watch" is allowed/.test(NEWS_SYSTEM),
);

console.log("\n  What it is given");

const full = newsUserPrompt({
  headline: "Freddie Mac weekly survey moves",
  detail: "The thirty year averaged 6.2 percent this week, down from 6.4.",
  source: "Freddie Mac",
  url: "https://example.test/survey",
  audience: "Agents in Yuma",
});
check("the headline is there", /Freddie Mac weekly survey moves/.test(full));
check("the article text is marked as the article's, not his", /came from the article, not from the creator/i.test(full));
check("the source is named, so attribution has something to name", /WHO REPORTED IT\nFreddie Mac/.test(full));
check("the audience is passed through", /Agents in Yuma/.test(full));

const headlineOnly = newsUserPrompt({ headline: "Rates moved again" });
check(
  "with no article text it is told it has no figures to use at all",
  /there are no figures you may use at all/i.test(headlineOnly),
  headlineOnly,
);
check(
  "...and told to say it worked from the headline only",
  /worked from the headline only/i.test(headlineOnly),
  "otherwise the piece reads as though he had read the article",
);

const noSource = newsUserPrompt({ headline: "h", detail: "The rate hit 6.2 percent." });
check(
  "text with no named source means no figure may be repeated",
  /do not repeat any figure from the text above/i.test(noSource),
  "attribution has to name someone, and nobody was named",
);
check(
  "...and that warning does not appear when there is nothing to attribute",
  !/do not repeat any figure/i.test(newsUserPrompt({ headline: "h" })),
);

console.log("\n  Catching a figure that came from nowhere");

const article = ["Freddie Mac weekly survey moves", "The thirty year averaged 6.2 percent this week, down from 6.4."];

check(
  "a figure the article actually had is not flagged",
  unsourcedFigures(
    { hook: "", body: "Freddie Mac put the thirty year at 6.2 percent this week.", caption: "", notes: "" },
    article,
  ).length === 0,
);
check(
  "a figure written in words still matches the article's digits",
  unsourcedFigures(
    { hook: "", body: "Freddie Mac had it at six point two.", caption: "", notes: "" },
    article,
  ).length === 0,
  "the model writes rates out loud because he says them out loud",
);
check(
  "a payment worked out from the rate IS flagged",
  unsourcedFigures(
    { hook: "", body: "At 6.2 percent your payment on 400,000 is about $2,450.", caption: "", notes: "" },
    article,
  ).length > 0,
  "this is the compliance problem the attribution rule exists for",
);
check(
  "...and the flagged list names the invented numbers",
  (() => {
    const found = unsourcedFigures(
      { hook: "", body: "At 6.2 percent your payment on 400,000 is about $2,450.", caption: "", notes: "" },
      article,
    ).join(" ");
    return found.includes("400,000") && found.includes("$2,450");
  })(),
  JSON.stringify(unsourcedFigures(
    { hook: "", body: "At 6.2 percent your payment on 400,000 is about $2,450.", caption: "", notes: "" },
    article,
  )),
);
check(
  "a rate the article never mentioned is flagged",
  unsourcedFigures({ hook: "", body: "The thirty year is near 5.5 now.", caption: "", notes: "" }, article)
    .includes("5.5"),
);
check(
  "a hook with an invented figure is caught too, not just the body",
  unsourcedFigures({ hook: "Rates just hit 4.9", body: "", caption: "", notes: "" }, article).length > 0,
  "the hook is the part people read",
);
check(
  "the caption is checked as well",
  unsourcedFigures({ hook: "", body: "", caption: "Down to 3.1 percent", notes: "" }, article).length > 0,
);
check(
  "the notes are NOT checked",
  unsourcedFigures({ hook: "", body: "", caption: "", notes: "I avoided quoting the 5.5 figure" }, article).length === 0,
  "the notes are the model explaining itself to him, not something he posts",
);

check(
  "an invented rate spoken out loud is caught, not just one in digits",
  unsourcedFigures(
    { hook: "", body: "The thirty year is down near five point one now.", caption: "", notes: "" },
    article,
  ).some((f) => /five point one/i.test(f)),
  JSON.stringify(unsourcedFigures(
    { hook: "", body: "The thirty year is down near five point one now.", caption: "", notes: "" },
    article,
  )),
);
check(
  "...and a spoken amount too",
  unsourcedFigures(
    { hook: "", body: "On four hundred thousand that is real money.", caption: "", notes: "" },
    article,
  ).length > 0,
  "he says amounts out loud, so the model writes them out loud",
);
check(
  "what he is shown is the figure as the draft wrote it",
  unsourcedFigures(
    { hook: "", body: "Your payment on 400,000 is about $2,450.", caption: "", notes: "" },
    article,
  ).join(" ") === "400,000 $2,450",
  JSON.stringify(unsourcedFigures(
    { hook: "", body: "Your payment on 400,000 is about $2,450.", caption: "", notes: "" },
    article,
  )),
);

console.log("\n  Not crying wolf");

check(
  "counting things is not a claim",
  unsourcedFigures({ hook: "", body: "Three things changed this week, and 2 of them matter.", caption: "", notes: "" }, article).length === 0,
  "a warning that fires on 'three things' is one he learns to ignore",
);
check(
  "a year on its own is not a claim",
  unsourcedFigures({ hook: "", body: "The last time this happened was 2022.", caption: "", notes: "" }, article).length === 0,
);
check(
  "but a dollar amount is, even a round one",
  unsourcedFigures({ hook: "", body: "That is $500 a month.", caption: "", notes: "" }, article).length > 0,
);
check(
  "a figure from his verified facts counts as sourced",
  unsourcedFigures(
    { hook: "", body: "Our cap is 16,000.", caption: "", notes: "" },
    [...article, "eXp cap is 16,000"],
  ).length === 0,
  "the verified facts are passed in as a source, so his own checked numbers are not flagged",
);
check(
  "commas do not hide a match",
  unsourcedFigures({ hook: "", body: "16000 even.", caption: "", notes: "" }, ["cap is 16,000"]).length === 0,
);

console.log("\n  What comes back");
check("a normal answer passes through", normalizeNews({ hook: "a", body: "b", caption: "c", notes: "d" })?.body === "b");
check("an answer with nothing in it is nothing", normalizeNews({ notes: "sorry" }) === null);
check("a hook alone is still an answer", normalizeNews({ hook: "a" })?.hook === "a");
check("nonsense is nothing", normalizeNews(null) === null);
check(
  "an enormous body is cut rather than stored whole",
  (normalizeNews({ body: "x".repeat(9000) })?.body.length ?? 0) <= 4000,
);

console.log("\n  The route");
const route = readFileSync(join(ROOT, "app/api/news/route.ts"), "utf8");
check("the route flags unsourced figures rather than trusting the prompt", /unsourcedFigures\(/.test(route));
check(
  "...and passes it his verified facts as well as the article",
  /unsourcedFigures\([\s\S]{0,300}facts/.test(route),
  "without the facts, his own checked numbers get flagged and he stops reading the warning",
);

try { rmSync(dir, { recursive: true, force: true }); } catch {}

console.log(
  failures.length === 0
    ? `\nAll ${passed} checks passed.\n`
    : `\n${failures.length} FAILURE(S), ${passed} passed.\n`,
);
process.exit(failures.length === 0 ? 0 : 1);
