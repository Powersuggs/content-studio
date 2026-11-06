#!/usr/bin/env node
/**
 * Every table a migration creates must appear in MIGRATION_FOR_TABLE, or
 * the "you need to run this migration" message degrades to a vague one
 * exactly when somebody needs it most.
 *
 * This is the guard that stops the map rotting. The last three times a
 * table was added to this app, a hand-maintained list somewhere was missed,
 * so the list now has a test.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;

const source = readFileSync(join(ROOT, "lib/db-errors.ts"), "utf8");
const mapBlock = /MIGRATION_FOR_TABLE: Record<string, string> = \{([\s\S]*?)\};/.exec(source);
if (!mapBlock) {
  console.error("Could not find MIGRATION_FOR_TABLE in lib/db-errors.ts");
  process.exit(1);
}
const mapped = new Map();
for (const line of mapBlock[1].split("\n")) {
  const m = /^\s*([a-z_]+):\s*"([^"]+)"/.exec(line);
  if (m) mapped.set(m[1], m[2]);
}

const created = new Map();
const files = readdirSync(join(ROOT, "migrations")).filter((f) => f.endsWith(".sql")).sort();
for (const file of files) {
  const sql = readFileSync(join(ROOT, "migrations", file), "utf8");
  for (const m of sql.matchAll(/create table if not exists\s+([a-z_]+)/gi)) {
    const table = m[1].toLowerCase();
    if (!created.has(table)) created.set(table, file);
  }
}

const problems = [];
for (const [table, file] of created) {
  if (!mapped.has(table)) {
    problems.push(`  missing: "${table}" is created by ${file} but is not in MIGRATION_FOR_TABLE`);
  } else if (mapped.get(table) !== file) {
    problems.push(`  wrong:   "${table}" is created by ${file} but the map says ${mapped.get(table)}`);
  }
}
for (const table of mapped.keys()) {
  if (!created.has(table)) {
    problems.push(`  stale:   "${table}" is in MIGRATION_FOR_TABLE but no migration creates it`);
  }
}

if (problems.length) {
  console.error(`\nMigration map check FAILED: ${problems.length} problem(s).\n`);
  console.error(problems.join("\n"));
  console.error("\nFix lib/db-errors.ts so a missing table names the right file.\n");
  process.exit(1);
}

console.log(`\nMigration map check: all ${created.size} tables map to the migration that creates them.\n`);
