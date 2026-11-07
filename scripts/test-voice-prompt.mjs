#!/usr/bin/env node
/**
 * The vocabulary hint must never exceed Groq's ceiling.
 *
 * This is a regression test for a real outage: adding brokerage words to
 * the hint pushed an account with a full facts library past 896 characters,
 * and Groq rejects the whole request rather than truncating. Every
 * recording in the app failed, including the voice interview.
 *
 *   node scripts/test-voice-prompt.mjs
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(ROOT, "lib", "voice", "transcribe.ts"), "utf8");

// The two functions are pure, so they are lifted out and run directly
// rather than dragging the whole module (and its database and SDK imports)
// into a test.
const limit = Number(/MAX_VOCAB_PROMPT_CHARS = (\d+)/.exec(src)[1]);
const base = /const BASE_VOCAB =\n([\s\S]*?);\n/.exec(src)[1]
  .split("\n").map((l) => l.trim().replace(/^"|"$|" \+$/g, "")).join("");

function build(terms) {
  const prefix = " Also: ";
  const added = [];
  for (const term of terms) {
    if (`${base}${prefix}${[...added, term].join(", ")}.`.length > limit) break;
    added.push(term);
  }
  const out = added.length ? `${base}${prefix}${added.join(", ")}.` : base;
  return out.length > limit ? out.slice(0, limit) : out;
}

let failures = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `\n          ${detail}`}`);
  if (!ok) failures++;
};

check(`the base hint alone is under ${limit}`, base.length <= limit, `${base.length} chars`);
check("the base hint leaves room for account terms", limit - base.length > 100,
  `only ${limit - base.length} chars spare`);

// The shape that broke it: a real, full facts library.
const many = Array.from({ length: 120 }, (_, i) => `TermNumber${i}`);
const big = build(many);
check(`120 account terms still fits in ${limit}`, big.length <= limit, `${big.length} chars`);
check("...and some of them actually made it in", big.includes("TermNumber0"), big.slice(-80));

// One absurdly long term must not be half-written into the hint.
const huge = build(["X".repeat(5000)]);
check("a single oversized term is dropped, not sliced in", huge === base, `${huge.length} chars`);

check("no terms gives the base unchanged", build([]) === base, build([]).length + " chars");
check("a few terms are all included",
  build(["eXp", "ICA", "Yuma"]).endsWith("Also: eXp, ICA, Yuma."), build(["eXp","ICA","Yuma"]).slice(-40));

console.log(
  failures === 0
    ? `\nVoice prompt: all checks passed. Base is ${base.length} of ${limit} chars.\n`
    : `\n${failures} FAILURE(S)\n`,
);
process.exit(failures === 0 ? 0 : 1);
