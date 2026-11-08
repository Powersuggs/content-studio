#!/usr/bin/env node
/**
 * The idea suggester's filtering and its prompt, against the real module.
 *
 * Compiles lib/ideas/suggest.ts through a tsconfig that extends the app's
 * own, so "@/..." resolves the same way and a type error fails the run
 * instead of being emitted through.
 *
 *   node scripts/test-suggestions.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = mkdtempSync(join(tmpdir(), "suggest-"));
const cfg = join(out, "tsconfig.json");

writeFileSync(cfg, JSON.stringify({
  extends: join(ROOT, "tsconfig.json"),
  compilerOptions: {
    noEmit: false, outDir: out, rootDir: ROOT,
    module: "es2022", target: "es2022", incremental: false, noEmitOnError: true,
  },
  files: [join(ROOT, "lib/ideas/suggest.ts")],
}));

try {
  execFileSync("npx", ["tsc", "-p", cfg], { cwd: ROOT, stdio: "pipe" });
} catch (e) {
  console.error("Could not compile suggest.ts:\n" + (e.stdout?.toString() ?? e.message));
  process.exit(1);
}

const {
  normalizeSuggestions, winnersTable, referenceTable, suggestUserPrompt,
  SUGGEST_SYSTEM, LANES,
} =
  await import(pathToFileURL(join(out, "lib/ideas/suggest.js")).href);

let f = 0;
const ok = (l, c, d) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${c ? "" : `\n          ${d}`}`);
  if (!c) f++;
};

// ------------------------------------------------------------- filtering
const raw = {
  ideas: [
    { title: "The call I almost didn't make", note: "for agents", because: "post 3" },
    { title: "", note: "no title at all", because: "" },
    { title: "A carousel about commission splits", note: "", because: "" },
    { title: "the call I almost didn't make", note: "same thing again", because: "" },
    { title: "What my first week in real estate actually cost me", note: "", because: "" },
    "not an object",
    null,
    { note: "no title key", because: "" },
  ],
};
const got = normalizeSuggestions(raw);
ok("the usable ideas survive", got.length === 2, JSON.stringify(got.map((g) => g.title)));
ok("AN EMPTY TITLE IS DROPPED", !got.some((g) => g.title === ""), "an empty one got through");
ok("A FORMAT REQUEST IS NOT AN IDEA",
  !got.some((g) => /^A carousel/i.test(g.title)), "'A carousel about...' got through");
ok("the same idea twice becomes once",
  got.filter((g) => /almost didn't make/i.test(g.title)).length === 1, "it came through twice");
ok("junk entries do not crash it", Array.isArray(got), "it did not return a list");
ok("a missing note is an empty string, not undefined",
  got.every((g) => typeof g.note === "string"), JSON.stringify(got));
ok("nothing at all gives an empty list", normalizeSuggestions({}).length === 0, "it found something");
ok("a non-object gives an empty list", normalizeSuggestions(null).length === 0, "it found something");
ok("a long title is cut to something storable",
  normalizeSuggestions({ ideas: [{ title: "x".repeat(900) }] })[0].title.length === 500,
  "it was not capped");

// ---------------------------------------------------------- the winners table
const posts = [
  { id: 1, happened_on: "2026-09-25", caption: "Marine. Firefighter. Closer.", denom: 152,
    send_rate: 0.0921, like_rate: 0.21, engagement_rate: 0.33, watch_rate: 0.47 },
  { id: 2, happened_on: "2026-10-03", caption: "nobody is watching you", denom: 518,
    send_rate: 0.044, like_rate: 0.1, engagement_rate: 0.18, watch_rate: null },
];
const table = winnersTable(posts);
ok("the table shows the send rate as a percentage", table.includes("sent 9.2%"), table);
ok("a missing watch rate is simply absent", !table.includes("watched -"), table);
ok("the caption is in there", table.includes("Marine. Firefighter. Closer."), table);
ok("an empty history says so plainly",
  /nothing to|No posts/i.test(winnersTable([])), winnersTable([]));
ok("a very long caption is trimmed",
  winnersTable([{ ...posts[0], caption: "y".repeat(900) }]).includes("y".repeat(400)) &&
    !winnersTable([{ ...posts[0], caption: "y".repeat(900) }]).includes("y".repeat(401)),
  "it was not trimmed to 400");

// ------------------------------------------------- the inspiration half
const refs = [
  { handle: "branthemortgageman", happened_on: "2026-08-17",
    caption: "Middle class: upgrade the lifestyle. Millionaire: upgrade the cash flow. Same paycheck. Different outcome.",
    breakdown: "Two-way comparison. The reader places themselves without being asked a question." },
  { handle: "someoneelse", happened_on: "2026-07-02",
    caption: "Comment SMARTBUYER for my guide", breakdown: null },
];
const refTable = referenceTable(refs);
ok("a saved post shows who it came from", refTable.includes("@branthemortgageman"), refTable);
ok("its breakdown is passed along", refTable.includes("why it worked:"), refTable);
ok("one without a breakdown says so rather than looking analyzed",
  refTable.includes("(not broken down yet)"), refTable);
ok("no saved posts gives nothing rather than an empty heading",
  referenceTable([]) === "", JSON.stringify(referenceTable([])));

const both = suggestUserPrompt(posts, 8, refs);
ok("THE ASK CARRIES BOTH SOURCES",
  both.includes("Marine. Firefighter. Closer.") && both.includes("@branthemortgageman"), both.slice(0, 120));
ok("and labels which half is which",
  /saved from other creators/i.test(both), both.slice(0, 200));
ok("with no saved posts the ask is just his own",
  !/saved from other creators/i.test(suggestUserPrompt(posts, 8, [])),
  "the heading showed up with nothing under it");

ok("THE PROMPT SAYS TAKE THE MECHANISM NOT THE CONTENT",
  /Take the mechanism, never the content/.test(SUGGEST_SYSTEM), "no such rule");
ok("it forbids reusing their words or story",
  /Never reuse their words/.test(SUGGEST_SYSTEM), "no such rule");
ok("it forbids implying he did what they did",
  /implies he did what they did/.test(SUGGEST_SYSTEM), "no such rule");
ok("a lending reference is to be translated, not skipped",
  /lending is closed to him/.test(SUGGEST_SYSTEM.replace(/\s+/g, " ")), "no such rule");
ok("a reference with no mechanism is ignored rather than padded",
  /Padding\s+the batch/.test(SUGGEST_SYSTEM), "no such rule");

// ----------------------------------------------------------------- the prompt
ok("THE PROMPT BANS LENDING CONTENT", /never propose lending/i.test(SUGGEST_SYSTEM), "no such line");
ok("the prompt names every lane",
  LANES.every((l) => SUGGEST_SYSTEM.includes(l)), LANES.join(", "));
ok("the prompt says these are not the most viewed posts",
  /NOT the most viewed/.test(SUGGEST_SYSTEM), "the reasoning is missing");
ok("the prompt refuses a format as an idea",
  /is not an\s+idea/.test(SUGGEST_SYSTEM), "nothing stops it returning formats");
ok("THE PROMPT FORBIDS INVENTING HIS MEMORIES",
  /NEVER INVENT THEIR LIFE/.test(SUGGEST_SYSTEM), "nothing stops it making things up");
ok("and shows the difference rather than just asserting it",
  /the call you almost didn't make/.test(SUGGEST_SYSTEM) &&
    /reads like a memory and is not one/.test(SUGGEST_SYSTEM),
  "the worked example is missing");
ok("it names the specifics that must not be invented",
  /no invented times, places, numbers, quotes, clients, conversations/i.test(
    SUGGEST_SYSTEM.replace(/\s+/g, " ")),
  "the list of what not to invent is missing");
ok("but their own captions are still fair game",
  /because they wrote it/.test(SUGGEST_SYSTEM), "it may now refuse to use real captions");

ok("the ask names how many are wanted",
  suggestUserPrompt(posts, 8).includes("Propose 8 new ideas"), suggestUserPrompt(posts, 8).slice(-40));

console.log(f === 0 ? "\nsuggestions: all checks passed." : `\nsuggestions: ${f} FAILED.`);
process.exit(f === 0 ? 0 : 1);
