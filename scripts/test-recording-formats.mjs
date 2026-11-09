#!/usr/bin/env node
/**
 * What this records as, on whatever phone someone brings.
 *
 * Phones do not agree. iPhones record mp4. Chrome on Android usually
 * does now and used to not. Firefox records webm. Instagram takes mp4
 * and refuses webm, so which one comes out decides whether a video can
 * be posted, and the app has to pick the best available rather than
 * hardcode one and hope.
 *
 *   node scripts/test-recording-formats.mjs
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(ROOT, "components/session-mode/useRecorder.ts"), "utf8");

let f = 0;
const ok = (l, c, d) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${c ? "" : `\n          ${d}`}`);
  if (!c) f++;
};

// The real list, read from the file rather than retyped.
const block = src.slice(src.indexOf("const CANDIDATE_TYPES"), src.indexOf("];", src.indexOf("const CANDIDATE_TYPES")));
const types = [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]);

ok("there is a list of formats to try", types.length >= 3, JSON.stringify(types));
ok("MP4 IS TRIED BEFORE WEBM",
  types.findIndex((t) => t.includes("mp4")) < types.findIndex((t) => t.includes("webm")),
  JSON.stringify(types));
ok("the first choice names a codec rather than hoping",
  /codecs=/.test(types[0]), types[0]);
ok("plain mp4 is tried when the codec string is refused",
  types.includes("video/mp4"), JSON.stringify(types));
ok("webm is still there, because some browsers do nothing else",
  types.some((t) => t === "video/webm"), JSON.stringify(types));
ok("a browser that likes none of them is allowed to choose",
  /return undefined; \/\/ let the browser choose/.test(src), "no fallback to the browser default");

// The classifier the UI shows, lifted from the file.
const fnStart = src.indexOf("function formatOf");
const fn = src.slice(fnStart, src.indexOf("}", src.indexOf("return \"other\";", fnStart)) + 1);
const formatOf = new Function("mimeType", fn.slice(fn.indexOf("{") + 1, fn.lastIndexOf("}")));

ok("an iPhone recording reads as MP4", formatOf("video/mp4;codecs=avc1.42E01E,mp4a.40.2") === "mp4", formatOf("video/mp4"));
ok("a Firefox recording reads as WEBM", formatOf("video/webm;codecs=vp8,opus") === "webm", formatOf("video/webm"));
ok("nothing at all reads as other, not as webm",
  formatOf(undefined) === "other", String(formatOf(undefined)));
ok("something unexpected reads as other",
  formatOf("video/x-matroska;codecs=avc1") === "other", formatOf("video/x-matroska"));

// Every screen a person sees in Session Mode, so moving a control from
// one file to another cannot quietly drop the check with it.
const ui = ["Teleprompter.tsx", "ReviewPanel.tsx"]
  .map((f) => readFileSync(join(ROOT, "components/session-mode", f), "utf8"))
  .join("\n");
const both = src + ui;
ok("NO MESSAGE ASSUMES AN IPHONE",
  !/Safari rather than|in Safari before/.test(both),
  (both.match(/[^.]*Safari[^.]*\./g) || []).join(" | "));
ok("the format is shown on every piece", /t\.format\.toUpperCase\(\)/.test(ui), "format not displayed");
ok("and a format Instagram refuses is called out",
  /Instagram takes MP4/.test(ui), "no warning for a non-mp4 recording");

console.log(f === 0 ? "\nformats: all checks passed." : `\nformats: ${f} FAILED.`);
process.exit(f === 0 ? 0 : 1);
