#!/usr/bin/env node
/**
 * A pattern he wrote down has to actually reach the model.
 *
 * This is the whole point of the feature: he studies someone, writes
 * down what they do, and the app writes differently afterwards. If the
 * patterns are stored and not sent, the page looks like it works and
 * nothing changes about the hooks, which is exactly the shape of bug
 * that sat in `ideas.transcript` for months.
 *
 *   node scripts/test-patterns.mjs
 *
 * Needs esbuild for the pure half, Postgres for the storage half.
 * Skips with a note if either is missing.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
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

// render.ts imports nothing, which is why the renderer lives there
// rather than beside the queries: bundling those would drag a request
// context in for what is a pure function.
const dir = mkdtempSync(join(tmpdir(), "cs-pat-"));
let renderPatterns;
try {
  writeFileSync(
    join(dir, "entry.ts"),
    `export * from "${pathToFileURL(join(ROOT, "lib/hooks/render.ts")).pathname}";`,
  );
  const built = spawnSync("npx", ["--yes", "esbuild", join(dir, "entry.ts"), "--bundle",
    "--format=esm", "--platform=node", `--outfile=${join(dir, "out.mjs")}`], { encoding: "utf8" });
  if (built.status !== 0) {
    console.log("\nHook patterns: SKIPPED (esbuild could not bundle the renderer).\n");
    process.exit(0);
  }
  ({ renderPatterns } = await import(pathToFileURL(join(dir, "out.mjs")).href));
} catch {
  console.log("\nHook patterns: SKIPPED (could not build the renderer).\n");
  process.exit(0);
}

console.log("\nWhat the model is told\n");

const ONE = [{
  id: 1, name: "Away from pain", source: "Myron Golden", active: true,
  applies_to: "hook",
  what_it_does: "Open on the mistake the viewer is already making, not the result they want.",
  example: "7 biggest mistakes that destroy your chances, not 7 steps to success",
}];

const out = renderPatterns(ONE);
check("the pattern's name reaches the prompt", out.includes("Away from pain"));
check("the mechanism reaches the prompt", out.includes("Open on the mistake"), out);
check(
  "...and so does who it came from",
  out.includes("Myron Golden"),
  "a pattern that stops working has to be traceable to where it came from",
);
check("the example reaches the prompt", out.includes("7 biggest mistakes"));
check(
  "the model is told to apply the mechanism rather than copy the wording",
  /not a line to copy/i.test(out),
  "otherwise every hook comes out sounding like the person he borrowed it from",
);
check(
  "...and that his patterns beat the built-in archetypes",
  /beat the\s*\n?archetypes above/.test(out),
  out,
);

check(
  "a pattern switched off is not sent",
  !renderPatterns([{ ...ONE[0], active: false }]).includes("Away from pain"),
);
check(
  "no patterns means no heading at all",
  renderPatterns([]) === "" && renderPatterns([{ ...ONE[0], active: false }]) === "",
  "a heading with nothing under it invites the model to invent some",
);
check(
  "a pattern with no example still goes out",
  renderPatterns([{ ...ONE[0], example: null }]).includes("Open on the mistake"),
);
check(
  "a pattern with no source does not say 'noticed in null'",
  !/noticed in null|noticed in\s*\)/.test(renderPatterns([{ ...ONE[0], source: null }])),
  renderPatterns([{ ...ONE[0], source: null }]),
);

console.log("\n  Patterns only go where they belong");

const MIXED = [
  ONE[0],
  {
    id: 2, name: "Title and cover never repeat", source: "Myron Golden",
    active: true, applies_to: "thumbnail",
    what_it_does: "The words on the cover say something the title does not, so the viewer has to put the two together.",
    example: null,
  },
];
const forHooks = renderPatterns(MIXED, "hook");
check(
  "a thumbnail note is NOT handed to the spoken-hook writer",
  !forHooks.includes("Title and cover never repeat"),
  "the model tries to honour it, the hook comes out worse, and the page still looks like the feature is working",
);
check("...while the spoken-hook note still is", forHooks.includes("Away from pain"));
const forThumbs = renderPatterns(MIXED, "thumbnail");
check(
  "asking for thumbnail patterns gets the thumbnail one",
  forThumbs.includes("Title and cover never repeat"),
);
check(
  "...and not the spoken-hook one",
  !forThumbs.includes("Away from pain"),
  forThumbs,
);
check(
  "a kind with nothing stored returns nothing at all",
  renderPatterns(MIXED, "caption") === "",
);
check(
  "hook is the default, so existing callers keep working",
  renderPatterns(MIXED) === forHooks,
);

console.log("\n  The wiring");
const route = readFileSync(join(ROOT, "app/api/hooks/route.ts"), "utf8");
check(
  "Hook Lab reads his patterns",
  /listPatterns\(\)/.test(route),
);
check(
  "...and puts them in the prompt it actually sends",
  /system: \[BASE_SYSTEM_PROMPT, studied/.test(route),
  "stored and not sent is the failure this whole test exists for",
);
check(
  "...after the built-in archetypes, so his win",
  route.indexOf("BASE_SYSTEM_PROMPT, studied") > 0,
);
check(
  "a database that has not been migrated yet does not break Hook Lab",
  /listPatterns\(\)\.catch\(\(\) => \[\]\)/.test(route),
  "the table arrives in a migration he may not have run yet",
);

console.log("\n  Storage");
const PG = "/usr/lib/postgresql/16/bin";
if (!existsSync(`${PG}/initdb`) || spawnSync("id", ["claude"]).status !== 0) {
  console.log("  (skipped: no local Postgres)");
} else {
  const base = mkdtempSync(join(tmpdir(), "cs-patdb-"));
  const PORT = "5591";
  const asClaude = (c) => execFileSync("su", ["claude", "-c", c], { encoding: "utf8" });
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
    psql(readFileSync(join(ROOT, "migrations/0027_hook_patterns.sql"), "utf8")
      .replace(/references accounts \(id\) on delete cascade/, "")
      .replace(/app_current_account\(\)/g, "1"));

    psql(`insert into hook_patterns (account_id, name, what_it_does) values (1, 'ok', 'does a thing')`);
    let blankName = false;
    try { psql(`insert into hook_patterns (account_id, name, what_it_does) values (1, '  ', 'x')`); }
    catch { blankName = true; }
    check("a pattern with no name is refused", blankName);

    let blankWhat = false;
    try { psql(`insert into hook_patterns (account_id, name, what_it_does) values (1, 'x', '   ')`); }
    catch { blankWhat = true; }
    check(
      "a pattern that does not say what it does is refused",
      blankWhat,
      "that field is the only part the model actually reads",
    );

    const active = psql(`select active from hook_patterns where name = 'ok'`).trim();
    check("a new pattern starts switched on", active === "t", active);

    // 0028: the seed insert was run twice and silently doubled every
    // pattern, which reads as eight patterns when there are four and
    // doubles their weight in the prompt.
    psql(`insert into hook_patterns (account_id, name, what_it_does)
          values (1, 'dupe', 'a'), (1, 'dupe', 'a'), (1, 'DUPE', 'a')`);
    const before = Number(psql(`select count(*) from hook_patterns where lower(name) = 'dupe'`).trim());
    check("duplicates could be created before the fix", before === 3, String(before));

    psql(readFileSync(join(ROOT, "migrations/0028_hook_patterns_unique.sql"), "utf8"));
    const after = Number(psql(`select count(*) from hook_patterns where lower(name) = 'dupe'`).trim());
    check("the repair leaves exactly one of each", after === 1, String(after));
    check(
      "...and it keeps the oldest rather than a random one",
      psql(`select name from hook_patterns where lower(name) = 'dupe'`).trim() === "dupe",
    );

    let blocked = false;
    try { psql(`insert into hook_patterns (account_id, name, what_it_does) values (1, 'dupe', 'a')`); }
    catch { blocked = true; }
    check("adding the same name again is refused afterwards", blocked);

    let caseBlocked = false;
    try { psql(`insert into hook_patterns (account_id, name, what_it_does) values (1, 'DuPe', 'a')`); }
    catch { caseBlocked = true; }
    check(
      "...including the same name typed with different capitals",
      caseBlocked,
      "'Away from pain' and 'away from pain' are one pattern typed twice",
    );

    psql(readFileSync(join(ROOT, "migrations/0028_hook_patterns_unique.sql"), "utf8"));
    check("the repair can be run twice", true);

    const other = psql(`insert into hook_patterns (account_id, name, what_it_does)
                        values (2, 'dupe', 'a') returning id`).trim();
    check(
      "another account may use the same pattern name",
      other !== "",
      "the index is per account, not global",
    );

    // 0029
    psql(readFileSync(join(ROOT, "migrations/0029_pattern_applies_to.sql"), "utf8"));
    const backfilled = psql(`select distinct applies_to from hook_patterns`).trim();
    check(
      "everything already stored is treated as a spoken-hook pattern",
      backfilled === "hook",
      backfilled,
    );

    const sameName = psql(`insert into hook_patterns (account_id, name, what_it_does, applies_to)
                           values (1, 'dupe', 'a', 'thumbnail') returning id`).trim();
    check(
      "the same name may be used for a different kind of pattern",
      sameName !== "",
      "'away from pain' is a real note for both a spoken hook and a thumbnail, and they are not the same note",
    );

    let stillBlocked = false;
    try {
      psql(`insert into hook_patterns (account_id, name, what_it_does, applies_to)
            values (1, 'dupe', 'a', 'thumbnail')`);
    } catch { stillBlocked = true; }
    check("...but not twice for the same kind", stillBlocked);

    let badKind = false;
    try {
      psql(`insert into hook_patterns (account_id, name, what_it_does, applies_to)
            values (1, 'odd', 'a', 'billboard')`);
    } catch { badKind = true; }
    check("a kind nobody meant is refused", badKind);

    psql(readFileSync(join(ROOT, "migrations/0029_pattern_applies_to.sql"), "utf8"));
    check("0029 can be run twice", true);
  } finally {
    try { asClaude(`${PG}/pg_ctl -D ${base}/data stop -m immediate`); } catch {}
    try { rmSync(base, { recursive: true, force: true }); } catch {}
  }
}

try { rmSync(dir, { recursive: true, force: true }); } catch {}

console.log(
  failures.length === 0
    ? `\nAll ${passed} checks passed.\n`
    : `\n${failures.length} FAILURE(S), ${passed} passed.\n`,
);
process.exit(failures.length === 0 ? 0 : 1);
