#!/usr/bin/env node
/**
 * The piece list: reordering, and the memory it has to give back.
 *
 * The reorder is pure logic, so it is run directly. The leak guards are
 * checked by reading the shipping file, because a revoked object URL
 * leaves nothing behind to assert on: a piece holds a playable URL for
 * its whole video, and dropping the row without revoking leaks the lot
 * for as long as the page is open. On a phone that is how a filming
 * session ends in a crash on the sixth take.
 *
 *   node scripts/test-takes.mjs
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

// Lifted from the hook rather than retyped, so a change there fails here.
const body = src.slice(src.indexOf("const moveTake"), src.indexOf("const clearTakes"));
const inner = body.slice(body.indexOf("setTakes((prev) => {") + "setTakes((prev) => {".length, body.lastIndexOf("});"));
const move = new Function("prev", "id", "direction", inner.replace(/\breturn prev;/g, "return prev;"));

const ids = (a) => a.map((t) => t.id).join(",");
const L = [{ id: 1 }, { id: 2 }, { id: 3 }];

ok("moving the middle piece up", ids(move(L, 2, -1)) === "2,1,3", ids(move(L, 2, -1)));
ok("moving the middle piece down", ids(move(L, 2, 1)) === "1,3,2", ids(move(L, 2, 1)));
ok("THE FIRST PIECE CANNOT GO HIGHER", ids(move(L, 1, -1)) === "1,2,3", ids(move(L, 1, -1)));
ok("THE LAST PIECE CANNOT GO LOWER", ids(move(L, 3, 1)) === "1,2,3", ids(move(L, 3, 1)));
ok("an id that is not in the list changes nothing", ids(move(L, 99, 1)) === "1,2,3", ids(move(L, 99, 1)));
ok("the list is replaced, never mutated in place", ids(L) === "1,2,3", ids(L));

ok("DELETING A PIECE GIVES ITS MEMORY BACK",
  /removeTake[\s\S]{0,400}revokeObjectURL/.test(src), "removeTake does not revoke the object URL");
ok("clearing them all gives every one back",
  /clearTakes[\s\S]{0,300}forEach\(\(t\) => URL\.revokeObjectURL/.test(src), "clearTakes does not revoke");
ok("each piece is issued its own id rather than using its position",
  /takeIdRef\.current\+\+/.test(src), "ids are not issued");

console.log(f === 0 ? "\npieces: all checks passed." : `\npieces: ${f} FAILED.`);
process.exit(f === 0 ? 0 : 1);
