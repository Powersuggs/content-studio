#!/usr/bin/env node
/**
 * The spoken words have to reach the writer.
 *
 * `ideas.transcript` existed as a column for months and nothing read it.
 * An idea captured by talking for two minutes stored every word, and then
 * the writer was handed the one-line title alone, so the piece came back
 * in no particular voice with none of the specifics that had been said out
 * loud. The feature looked finished and was not.
 *
 * That failure is invisible on screen, which is why it lasted: a carousel
 * written from a title still looks like a carousel. So these are the
 * things that have to stay true, asserted rather than eyeballed.
 *
 *   node scripts/test-talk-prompt.mjs
 *
 * Needs esbuild to bundle the two pure modules. Skips with a note if it
 * cannot.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

let passed = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) { passed++; console.log(`  PASS  ${label}`); }
  else { failures.push(label); console.log(`  FAIL  ${label}${detail ? `\n          ${detail}` : ""}`); }
}

const dir = mkdtempSync(join(tmpdir(), "cs-talk-"));
let mod;
try {
  writeFileSync(
    join(dir, "entry.ts"),
    `export { userPromptFor } from "${pathToFileURL(join(ROOT, "lib/ideas/generate.ts")).pathname}";
     export * from "${pathToFileURL(join(ROOT, "lib/talk/prompt.ts")).pathname}";`,
  );
  const built = spawnSync(
    "npx",
    ["--yes", "esbuild", join(dir, "entry.ts"), "--bundle", "--format=esm",
     "--platform=node", `--outfile=${join(dir, "out.mjs")}`],
    { encoding: "utf8" },
  );
  if (built.status !== 0) {
    console.log("\nTalk it out: SKIPPED (esbuild could not bundle the modules).\n");
    process.exit(0);
  }
  mod = await import(pathToFileURL(join(dir, "out.mjs")).href);
} catch {
  console.log("\nTalk it out: SKIPPED (could not build the modules).\n");
  process.exit(0);
} finally {
  // The bundle is imported by now, so the directory can go.
  setTimeout(() => { try { rmSync(dir, { recursive: true, force: true }); } catch {} }, 0);
}

const { userPromptFor, normalizeTitle, firstWords, MIN_TRANSCRIPT_CHARS } = mod;

console.log("\nWhat the writer is actually given\n");

// A transcript with the three things that only survive if it is used: his
// phrasing, a real number, and a real objection.
const SPOKEN =
  "Um, so the thing agents get wrong about the split, right, is they look " +
  "at eighty twenty and they stop there. I had a guy last month, he was on " +
  "a ninety ten at his old shop and he was still taking home less, because " +
  "the fees ate it. The, the split is the headline and the fees are the " +
  "actual number. No, sorry, I mean the cap is the actual number.";

const withTalk = userPromptFor({ title: "The split is not the decision", transcript: SPOKEN });

check(
  "every word he said reaches the prompt",
  withTalk.includes(SPOKEN),
  "the transcript was trimmed, summarised or dropped before the model saw it",
);
check(
  "the transcript is named as the source, not as background",
  /source for this piece/i.test(withTalk),
  "a model given an unlabelled wall of speech writes about it rather than from it",
);
check(
  "it is told to keep his phrasing",
  /their phrasing is the point/i.test(withTalk),
  "without this the speech gets tidied into generic business writing, which is the one thing a transcript is meant to prevent",
);
check(
  "it is told the specifics in there are real",
  /do not swap a real specific for a general one/i.test(withTalk),
  "the ninety ten and the guy last month are the whole value of the take",
);
check(
  "it is told to cut the stumbles rather than quote them",
  /do not quote the stumbles/i.test(withTalk),
  "the transcriber deliberately keeps 'um' and self-corrections, so the writer has to be the one to drop them",
);
check(
  "it is told a later change of mind wins",
  /the later version is what they think/i.test(withTalk),
  "he said 'no, sorry, I mean the cap' and the piece has to follow that",
);
check(
  "it is forbidden from adding claims he did not make",
  /do not add a claim, a statistic or a story that is not in here/i.test(withTalk),
  "a model filling a gap in a transcript invents a statistic, which he would then publish",
);
check(
  "the transcript comes before the title",
  withTalk.indexOf(SPOKEN) < withTalk.indexOf("The split is not the decision"),
  "leading with the title has the model write to the summary instead of the substance",
);

// Without a transcript, nothing about the old path may change.
const typed = userPromptFor({ title: "Why rates moved", note: "keep it short" });
check(
  "a typed idea still reads as it did",
  typed.includes("THE IDEA") && typed.includes("Why rates moved") && typed.includes("keep it short"),
  typed,
);
check(
  "a typed idea is not told to use a transcript it does not have",
  !/transcript/i.test(typed),
  typed,
);
check(
  "an empty transcript counts as not having one",
  !/transcript/i.test(userPromptFor({ title: "x", transcript: "   \n  " })),
  "whitespace from an abandoned recording must not switch the prompt over",
);
check(
  "a note survives alongside a transcript",
  userPromptFor({ title: "x", transcript: SPOKEN, note: "for the newsletter" })
    .includes("for the newsletter"),
);

console.log("\n  Filing the take");

// "cut at a word" cannot be judged from the title alone, since a title
// ending "they..." looks the same either way. It is judged against the
// transcript: the kept part must end exactly where a word ends in it.
const flatSpoken = SPOKEN.trim().replace(/\s+/g, " ");
const kept = firstWords(SPOKEN).replace(/\.\.\.$/, "");
check(
  "a title is cut at a word, not mid-word",
  firstWords(SPOKEN).endsWith("...") &&
    flatSpoken.startsWith(kept) &&
    (flatSpoken.length === kept.length || flatSpoken[kept.length] === " "),
  `kept "${kept}", next character in what he said was "${flatSpoken[kept.length]}"`,
);
check(
  "...and stays short enough to read in a list",
  firstWords(SPOKEN).length <= 74,
  `${firstWords(SPOKEN).length} characters`,
);
check(
  "a short take is used whole, with no trailing dots",
  firstWords("Rates moved today") === "Rates moved today",
);
// SPOKEN happens to have a space exactly on the boundary, so it agrees
// with a broken implementation. This one does not: the word there
// straddles the limit, and a naive slice chops it in half.
const STRADDLES = `${"word ".repeat(13)}underwriting is the bit nobody explains`;
check(
  "...including when a word straddles the limit",
  firstWords(STRADDLES) === `${"word ".repeat(13).trimEnd()}...`,
  `got "${firstWords(STRADDLES)}"`,
);
check(
  "a single word longer than the limit is still cut rather than dropped",
  firstWords("a".repeat(200)).length <= 74 && firstWords("a".repeat(200)).endsWith("..."),
  firstWords("a".repeat(200)),
);
check(
  "a take that cannot be titled is still saved under its own words",
  normalizeTitle({ nonsense: true }, SPOKEN).title === firstWords(SPOKEN),
  "losing two minutes of talking because the naming step failed would be absurd",
);
check(
  "an over-long title is cut rather than left to fail the insert",
  normalizeTitle({ title: "x".repeat(400), angle: "y".repeat(900) }, SPOKEN).title.length <= 180,
);
check(
  "an over-long angle is cut too",
  normalizeTitle({ title: "ok", angle: "y".repeat(900) }, SPOKEN).angle.length <= 500,
);
check(
  "a real answer passes through untouched",
  normalizeTitle({ title: "The split is not the decision", angle: "Fees decide it" }, SPOKEN)
    .title === "The split is not the decision",
);
check(
  "an empty transcript still yields a usable title",
  firstWords("") === "Untitled take",
);

console.log("\n  The wiring, which is what broke last time");

const queries = readFileSync(join(ROOT, "lib/ideas/queries.ts"), "utf8");
const route = readFileSync(join(ROOT, "app/api/idea-output/route.ts"), "utf8");
const talkRoute = readFileSync(join(ROOT, "app/api/talk/route.ts"), "utf8");

check(
  "the idea is read out of the database WITH its transcript",
  /select id, title, note, transcript from ideas/.test(queries),
  "this is the exact line that was missing the column",
);
check(
  "the writing route builds its prompt with userPromptFor",
  /userPromptFor\(idea\)/.test(route),
  "a route that builds the string inline will drift from what is tested here",
);
check(
  "...and does not still assemble it by hand",
  !/The idea:\\n\$\{idea\.title\}/.test(route),
);
check(
  "the talk route stores the transcript on the idea",
  /transcript,/.test(talkRoute) && /createIdea\(/.test(talkRoute),
);
check(
  "a take too short to work from is refused before it costs a model call",
  new RegExp(`length < MIN_TRANSCRIPT_CHARS`).test(talkRoute) && MIN_TRANSCRIPT_CHARS >= 20,
  `MIN_TRANSCRIPT_CHARS is ${MIN_TRANSCRIPT_CHARS}`,
);
check(
  "a model failure does not lose the recording",
  /catch \{[\s\S]*?firstWords\(transcript\)/.test(talkRoute),
  "the title call has to be wrapped so the take is saved either way",
);

console.log(
  failures.length === 0
    ? `\nAll ${passed} checks passed.\n`
    : `\n${failures.length} FAILURE(S), ${passed} passed.\n`,
);
process.exit(failures.length === 0 ? 0 : 1);
