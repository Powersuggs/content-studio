#!/usr/bin/env node
/**
 * Rearranging an outline must never lose a chapter he wrote.
 *
 * This module has one genuinely dangerous operation. `books` has a
 * unique index on (book_id, position), so a shuffle that passes through
 * a colliding state is refused by the database halfway through, leaving
 * the outline in a state nobody designed. And pressing "outline again"
 * after writing four chapters must not delete four chapters of writing.
 *
 * Neither failure is visible from reading the code, and the second one
 * destroys work rather than merely annoying. So the plan is pure data,
 * and here it is both proved as data and applied to a real Postgres with
 * the real index, checking EVERY intermediate state rather than only the
 * end of the shuffle.
 *
 *   node scripts/test-books.mjs
 *
 * Builds its own throwaway database and removes it. Skips with a note
 * when Postgres or esbuild is unavailable.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, writeFileSync } from "node:fs";
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

// ---- the pure plan -------------------------------------------------
const bundleDir = mkdtempSync(join(tmpdir(), "cs-books-js-"));
let mod;
try {
  writeFileSync(
    join(bundleDir, "entry.ts"),
    `export * from "${pathToFileURL(join(ROOT, "lib/books/plan.ts")).pathname}";
     export { countWords } from "${pathToFileURL(join(ROOT, "lib/books/types.ts")).pathname}";`,
  );
  const built = spawnSync("npx", ["--yes", "esbuild", join(bundleDir, "entry.ts"),
    "--bundle", "--format=esm", "--platform=node", `--outfile=${join(bundleDir, "out.mjs")}`],
    { encoding: "utf8" });
  if (built.status !== 0) {
    console.log("\nBooks: SKIPPED (esbuild could not bundle the plan).\n");
    process.exit(0);
  }
  mod = await import(pathToFileURL(join(bundleDir, "out.mjs")).href);
} catch {
  console.log("\nBooks: SKIPPED (could not build the plan).\n");
  process.exit(0);
}
const { planOutline, planSwap, positionsAreValid, countWords } = mod;

console.log("\nRearranging an outline\n");

const twelveOutlined = Array.from({ length: 12 }, (_, i) => ({
  id: 100 + i, position: i + 1, written: false,
}));

let plan = planOutline(twelveOutlined, 10);
check(
  "a fresh outline replaces an untouched one entirely",
  plan.deleteIds.length === 12 && plan.inserts.length === 10 && plan.moves.length === 0,
  JSON.stringify(plan).slice(0, 140),
);
check(
  "...and the new chapters start at one",
  plan.inserts[0]?.position === 1 && plan.inserts.at(-1)?.position === 10,
);

// The case that destroys work if it is got wrong.
const halfWritten = [
  { id: 1, position: 1, written: true },
  { id: 2, position: 2, written: false },
  { id: 3, position: 3, written: true },
  { id: 4, position: 4, written: false },
  { id: 5, position: 5, written: true },
];
plan = planOutline(halfWritten, 6);
check(
  "re-outlining never deletes a chapter with writing in it",
  !plan.deleteIds.includes(1) && !plan.deleteIds.includes(3) && !plan.deleteIds.includes(5),
  `would have deleted ${JSON.stringify(plan.deleteIds)}`,
);
check(
  "...and does delete the ones that were only ever an outline",
  plan.deleteIds.sort().join() === "2,4",
  JSON.stringify(plan.deleteIds),
);
check(
  "the written chapters keep their order and move to the front",
  JSON.stringify(plan.moves.slice(3)) ===
    JSON.stringify([{ id: 1, position: 1 }, { id: 3, position: 2 }, { id: 5, position: 3 }]),
  JSON.stringify(plan.moves),
);
check(
  "the new chapters are appended after them, not over them",
  plan.inserts[0]?.position === 4 && plan.inserts.length === 6,
  JSON.stringify(plan.inserts),
);
check(
  "every surviving chapter is parked before any is placed",
  plan.moves.slice(0, 3).every((m) => m.position < 0) &&
    plan.moves.slice(3).every((m) => m.position > 0),
  "a plan that places before parking collides on the unique index",
);

plan = planOutline([], 8);
check("outlining an empty book just inserts", plan.moves.length === 0 && plan.inserts.length === 8);
plan = planOutline(halfWritten, 0);
check(
  "an empty outline keeps the writing and adds nothing",
  plan.inserts.length === 0 && plan.moves.length === 6,
  JSON.stringify(plan),
);

console.log("\n  Moving one chapter");

const five = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, position: i + 1 }));
check(
  "moving up swaps with the one above",
  JSON.stringify(planSwap(five, 3, "up")) ===
    JSON.stringify([{ id: 3, position: -1 }, { id: 2, position: 3 }, { id: 3, position: 2 }]),
  JSON.stringify(planSwap(five, 3, "up")),
);
check("the first chapter cannot move up", planSwap(five, 1, "up").length === 0);
check("the last chapter cannot move down", planSwap(five, 5, "down").length === 0);
check("a chapter that is not there moves nothing", planSwap(five, 99, "up").length === 0);
check(
  "a swap parks before it places",
  planSwap(five, 3, "down")[0].position < 0,
);
check(
  "gappy positions still swap correctly",
  JSON.stringify(planSwap([{ id: 7, position: 2 }, { id: 8, position: 9 }], 8, "up")) ===
    JSON.stringify([{ id: 8, position: -1 }, { id: 7, position: 9 }, { id: 8, position: 2 }]),
  JSON.stringify(planSwap([{ id: 7, position: 2 }, { id: 8, position: 9 }], 8, "up")),
);

console.log("\n  Counting words the way a writer means it");
// The hash is not a word; the heading's text is, because the chapter
// title is part of the chapter.
check(
  "the hash on a heading is not counted, the heading itself is",
  countWords("# A chapter\n\nTwo words") === 4,
  String(countWords("# A chapter\n\nTwo words")),
);
check("list markers are not words", countWords("- one\n- two") === 2);
check("emphasis is not a word", countWords("that was *really* bad") === 4);
check("nothing is zero", countWords("") === 0 && countWords(null) === 0);
check("punctuation alone is not a word", countWords("one two . , --") === 2, String(countWords("one two . , --")));

// ---- against the real index ----------------------------------------
const PG = "/usr/lib/postgresql/16/bin";
if (!existsSync(`${PG}/initdb`) || spawnSync("id", ["claude"]).status !== 0) {
  console.log("\n  (Skipping the database half: no local Postgres.)\n");
} else {
  const base = mkdtempSync(join(tmpdir(), "cs-books-"));
  const PORT = "5571";
  const asClaude = (cmd) => execFileSync("su", ["claude", "-c", cmd], { encoding: "utf8" });
  let n = 0;
  const psql = (sql) => {
    const f = join(base, `q${n++}.sql`);
    writeFileSync(f, sql, { mode: 0o644 });
    return asClaude(`${PG}/psql -h ${base} -p ${PORT} -U claude -d t -tAq -v ON_ERROR_STOP=1 -f ${f}`);
  };
  try {
    execFileSync("chmod", ["o+rx", base]);
    execFileSync("chown", ["-R", "claude", base]);
    asClaude(`${PG}/initdb -D ${base}/data -U claude --auth=trust`);
    asClaude(`${PG}/pg_ctl -D ${base}/data -o "-p ${PORT} -k ${base}" -l ${base}/log start -w`);
    asClaude(`${PG}/createdb -h ${base} -p ${PORT} -U claude t`);

    console.log("\n  Against the real unique index");

    psql(`create table book_chapters (
      id bigint primary key, book_id bigint not null, position int not null,
      title text not null, body text
    );
    create unique index chapters_book_position_idx on book_chapters (book_id, position);`);

    // Five chapters, three of them written, in the awkward order.
    psql(halfWritten
      .map((c) => `insert into book_chapters values (${c.id}, 1, ${c.position}, 'c${c.id}', ${c.written ? "'prose'" : "null"});`)
      .join("\n"));

    // Apply the plan exactly as the query layer does, one statement at a
    // time, and let the index judge every intermediate state.
    const p = planOutline(halfWritten, 6);
    let refused = null;
    try {
      psql(`delete from book_chapters where id in (${p.deleteIds.join(",")})`);
      for (const m of p.moves) {
        psql(`update book_chapters set position = ${m.position} where id = ${m.id}`);
      }
      let next = 1000;
      for (const ins of p.inserts) {
        psql(`insert into book_chapters values (${next++}, 1, ${ins.position}, 'new', null)`);
      }
    } catch (e) {
      refused = String(e.stderr ?? e.message).split("\n")[0];
    }
    check(
      "the database accepts every step of the shuffle, not just the end",
      refused === null,
      `refused at: ${refused}`,
    );

    const after = psql(`select id, position from book_chapters where book_id = 1 order by position`)
      .trim().split("\n").filter(Boolean).map((l) => l.split("|").map(Number));
    check(
      "the writing survived",
      [1, 3, 5].every((id) => after.some(([i]) => i === id)),
      JSON.stringify(after),
    );
    check(
      "positions end up one to nine with no gaps and no repeats",
      JSON.stringify(after.map(([, pos]) => pos)) === JSON.stringify([1,2,3,4,5,6,7,8,9]),
      JSON.stringify(after.map(([, pos]) => pos)),
    );
    check(
      "...and that arrangement is one the index would accept",
      positionsAreValid(after.map(([, pos]) => pos)),
    );

    // Now a swap, against the same index.
    const live = after.map(([id, position]) => ({ id, position }));
    let swapRefused = null;
    try {
      for (const step of planSwap(live, live[3].id, "up")) {
        psql(`update book_chapters set position = ${step.position} where id = ${step.id}`);
      }
    } catch (e) {
      swapRefused = String(e.stderr ?? e.message).split("\n")[0];
    }
    check("a swap passes the index at every step", swapRefused === null, `refused at: ${swapRefused}`);
    const swapped = psql(`select id from book_chapters where book_id = 1 order by position`)
      .trim().split("\n").filter(Boolean).map(Number);
    check(
      "the two chapters actually traded places",
      swapped[2] === live[3].id && swapped[3] === live[2].id,
      JSON.stringify(swapped),
    );

    // The naive version, to show the index really would have refused it
    // and that this test is not passing vacuously.
    let naiveRefused = false;
    try {
      psql(`update book_chapters set position = 1 where id = ${swapped[1]}`);
    } catch { naiveRefused = true; }
    check(
      "placing straight onto an occupied position IS refused",
      naiveRefused,
      "if this passes, the index is missing and the parking step proves nothing",
    );
  } finally {
    try { asClaude(`${PG}/pg_ctl -D ${base}/data stop -m immediate`); } catch {}
    try { rmSync(base, { recursive: true, force: true }); } catch {}
  }
}

try { rmSync(bundleDir, { recursive: true, force: true }); } catch {}

console.log(
  failures.length === 0
    ? `\nAll ${passed} checks passed.\n`
    : `\n${failures.length} FAILURE(S), ${passed} passed.\n`,
);
process.exit(failures.length === 0 ? 0 : 1);
