#!/usr/bin/env node
/**
 * The week board's date handling, against the real page module.
 *
 * Dates near midnight are where this kind of page goes wrong: build a
 * day from new Date("2026-11-09") and you get midnight UTC, which in
 * Arizona is the evening before, and the whole week shifts by one.
 *
 *   node scripts/test-week.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = mkdtempSync(join(tmpdir(), "week-"));

// The two date helpers live inside a page and a client component, so
// they are lifted out by name and compiled on their own. Lifted, not
// retyped: the text below is read from the files that ship.
function lift(file, fnName) {
  const src = readFileSync(join(ROOT, file), "utf8");
  const start = src.indexOf(`function ${fnName}`);
  if (start === -1) throw new Error(`${fnName} not found in ${file}. Did it get renamed?`);
  let depth = 0, i = src.indexOf("{", start), end = -1;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) { end = i + 1; break; }
  }
  return "export " + src.slice(start, end);
}

writeFileSync(
  join(out, "lifted.ts"),
  lift("app/this-week/page.tsx", "weekFrom") + "\n\n" + lift("components/queue/WeekBoard.tsx", "dayLabel"),
);
execFileSync("npx", ["tsc", join(out, "lifted.ts"), "--outDir", out, "--module", "es2022",
  "--target", "es2022", "--moduleResolution", "bundler", "--noEmitOnError", "--skipLibCheck"],
  { cwd: ROOT, stdio: "pipe" });
const { weekFrom, dayLabel } = await import(pathToFileURL(join(out, "lifted.js")).href);

let f = 0;
const ok = (l, c, d) => { console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${c ? "" : `\n          ${d}`}`); if (!c) f++; };

const w = weekFrom("2026-11-08");
ok("the week starts today", w[0] === "2026-11-08", w[0]);
ok("and runs seven days", w.length === 7, String(w.length));
ok("THE DAYS DO NOT SLIP",
  JSON.stringify(w) === JSON.stringify(["2026-11-08","2026-11-09","2026-11-10","2026-11-11","2026-11-12","2026-11-13","2026-11-14"]),
  JSON.stringify(w));

ok("ACROSS THE END OF A MONTH",
  JSON.stringify(weekFrom("2026-11-28")) ===
    JSON.stringify(["2026-11-28","2026-11-29","2026-11-30","2026-12-01","2026-12-02","2026-12-03","2026-12-04"]),
  JSON.stringify(weekFrom("2026-11-28")));
ok("across the end of a year",
  weekFrom("2026-12-29")[6] === "2027-01-04", weekFrom("2026-12-29")[6]);
ok("across a leap day",
  JSON.stringify(weekFrom("2028-02-26").slice(0, 5)) ===
    JSON.stringify(["2028-02-26","2028-02-27","2028-02-28","2028-02-29","2028-03-01"]),
  JSON.stringify(weekFrom("2028-02-26")));

ok("today says Today", dayLabel("2026-11-08", "2026-11-08") === "Today", dayLabel("2026-11-08","2026-11-08"));
ok("tomorrow says Tomorrow", dayLabel("2026-11-09", "2026-11-08") === "Tomorrow", dayLabel("2026-11-09","2026-11-08"));
ok("THE WEEKDAY IS THE RIGHT ONE", dayLabel("2026-11-10", "2026-11-08") === "Tuesday",
  `10 Nov 2026 came out as ${dayLabel("2026-11-10", "2026-11-08")}, it is a Tuesday`);
ok("a weekday across a month boundary is still right",
  dayLabel("2026-12-01", "2026-11-28") === "Tuesday",
  `1 Dec 2026 came out as ${dayLabel("2026-12-01", "2026-11-28")}, it is a Tuesday`);
ok("tomorrow across a month boundary",
  dayLabel("2026-12-01", "2026-11-30") === "Tomorrow", dayLabel("2026-12-01","2026-11-30"));

console.log(f === 0 ? "\nweek: all checks passed." : `\nweek: ${f} FAILED.`);
process.exit(f === 0 ? 0 : 1);
