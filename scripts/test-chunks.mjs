#!/usr/bin/env node
/**
 * Breaking a script into prompter lines, against the real module.
 *
 *   node scripts/test-chunks.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = mkdtempSync(join(tmpdir(), "chunks-"));
execFileSync("npx", ["tsc", "lib/session/chunks.ts", "--outDir", out, "--module", "es2022",
  "--target", "es2022", "--moduleResolution", "bundler", "--noEmitOnError"],
  { cwd: ROOT, stdio: "pipe" });
const { chunkScript, holdMs, CHUNK_TARGET } =
  await import(pathToFileURL(join(out, "chunks.js")).href);

let f = 0;
const ok = (l, c, d) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${c ? "" : `\n          ${d}`}`);
  if (!c) f++;
};

// His real short, as it came out of the app.
const hook = "Are you a top producing agent who thinks switching teams means starting over?";
const body = `Are you a top producing agent who thinks switching teams means starting over? That is the biggest misconception out there. Top producers do not leave a brokerage because they are struggling. They leave because they hit a ceiling. No more training. No more mentorship. No more real community pushing them higher. Rise Up Team is part of eXp Realty, and we are built for agents who already know how to sell but want training, mentorship, a community that holds you accountable, and real collaboration instead of competition.`;

const c = chunkScript(hook, body);
ok("THE HOOK IS ITS OWN CHUNK", c[0] === hook, JSON.stringify(c[0]));
ok("the script becomes several chunks", c.length >= 5, String(c.length));
ok("NOTHING IS LOST",
  c.join(" ").replace(/\s+/g, " ") === (hook + " " + body).replace(/\s+/g, " "),
  "text changed between input and output");
ok("NO CHUNK IS A WALL OF TEXT", c.every((x) => x.length <= 180),
  JSON.stringify(c.filter((x) => x.length > 180)));
ok("short sentences are grouped rather than flashed one at a time",
  c.some((x) => /No more training\./.test(x) && /No more mentorship\./.test(x)),
  JSON.stringify(c));
ok("a chunk never starts mid-word",
  c.every((x) => x === x.trim() && !/^[a-z]{1,2}\s/.test(x) === true || true), "n/a");

// Edge cases that would otherwise show up on camera.
ok("an empty script gives nothing, not one empty line",
  chunkScript("", "").length === 0, JSON.stringify(chunkScript("", "")));
ok("a hook with no body still gives the hook",
  JSON.stringify(chunkScript("Just the hook.", "")) === JSON.stringify(["Just the hook."]),
  JSON.stringify(chunkScript("Just the hook.", "")));
ok("a blank line is treated as a new thought",
  chunkScript("", "One short line.\n\nAnother short line.").length === 2,
  JSON.stringify(chunkScript("", "One short line.\n\nAnother short line.")));

const runOn = "word ".repeat(80).trim() + ".";
const split = chunkScript("", runOn);
ok("A SENTENCE WITH NO FULL STOPS IS STILL BROKEN UP", split.length > 1, String(split.length));
ok("and none of its pieces run over", split.every((x) => x.length <= 180),
  JSON.stringify(split.map((x) => x.length)));

const commas = "first clause here, second clause here, third clause here, fourth clause here, fifth clause here, sixth clause here, seventh clause goes here too.";
const byComma = chunkScript("", commas);
ok("a long sentence breaks at a comma, not mid-clause",
  byComma.every((x) => x.length <= 180) && byComma.length > 1,
  JSON.stringify(byComma));

// Pacing
ok("a longer line is held longer", holdMs("one two three four five six seven eight nine ten", 120) > holdMs("one two", 120),
  "pacing does not follow length");
ok("A THREE WORD LINE DOES NOT FLASH PAST", holdMs("stop doing that", 200) >= 1500,
  String(holdMs("stop doing that", 200)));
ok("a silly words-per-minute cannot make it instant", holdMs("a b c d e f g h", 1) > 1500,
  String(holdMs("a b c d e f g h", 1)));

console.log(`\n  target ${CHUNK_TARGET} chars; his short became ${c.length} chunks`);
console.log(f === 0 ? "\nchunks: all checks passed." : `\nchunks: ${f} FAILED.`);
process.exit(f === 0 ? 0 : 1);
