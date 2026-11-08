#!/usr/bin/env node
/**
 * The slide planner, tested against the real code.
 *
 * An earlier version of this file hand-copied defaultPlan and reconcile
 * so it could run outside Next. The copy drifted, and the test went on
 * passing while the real code was broken, which is worse than having no
 * test. So this compiles lib/slides/design.ts and lib/slides/plan.ts and
 * imports what actually ships.
 *
 *   node scripts/test-slide-plan.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = mkdtempSync(join(tmpdir(), "planner-"));

try {
  execFileSync(
    "npx",
    ["tsc", "lib/slides/design.ts", "lib/slides/plan.ts",
     "--outDir", out, "--module", "es2022", "--target", "es2022", "--moduleResolution", "bundler"],
    { cwd: ROOT, stdio: "pipe" },
  );
} catch (e) {
  console.error("Could not compile the planner:\n" + (e.stdout?.toString() ?? e.message));
  process.exit(1);
}

// tsc flattens to the common root of the inputs, so both land directly
// in the output directory rather than under lib/slides/. It also emits
// extensionless relative imports, which Node's ES loader will not
// resolve, so they are patched before importing.
const planJs = join(out, "plan.js");
writeFileSync(planJs, readFileSync(planJs, "utf8").replace(/(from\s+["']\.\/design)(["'])/g, "$1.js$2"));
const { defaultPlan, reconcile } = await import(pathToFileURL(join(out, "plan.js")).href);
const { layoutAccepts } = await import(pathToFileURL(join(out, "design.js")).href);

let f = 0;
const ok = (l, c, d) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${c ? "" : `\n          ${d}`}`);
  if (!c) f++;
};

// Four people and six places, roughly the shape of a real bank.
const bank = [
  { id: 10, kind: "person" }, { id: 11, kind: "scene" }, { id: 12, kind: "person" },
  { id: 13, kind: "scene" }, { id: 14, kind: "scene" }, { id: 15, kind: "person" },
  { id: 16, kind: "scene" }, { id: 17, kind: "scene" }, { id: 18, kind: "person" },
  { id: 19, kind: "scene" },
];
const kindOf = (id) => bank.find((p) => p.id === id)?.kind;

const p8 = defaultPlan(8, bank);
ok("every slide gets a photo", p8.slides.every((s) => s.photoId !== null),
  JSON.stringify(p8.slides.map((s) => s.photoId)));

// The deck opens and closes on a face. A carousel is a swipe toward an
// ask, and an ask delivered by a coffee cup is weaker than one delivered
// by the person making it. The middle slides stay varied.
ok("THE DECK OPENS ON A PERSON", kindOf(p8.slides[0].photoId) === "person",
  `slide 1 got ${kindOf(p8.slides[0].photoId)}`);
ok("AND CLOSES ON A PERSON", kindOf(p8.slides[7].photoId) === "person",
  `slide 8 got ${kindOf(p8.slides[7].photoId)}`);
ok("the two bookends are not the same photo",
  p8.slides[0].photoId !== p8.slides[7].photoId,
  `both got ${p8.slides[0].photoId}`);

// One person in the bank is the hard case: the cover should still get
// them, and the closer takes a repeat rather than leaving a gap.
const onePerson = [
  { id: 1, kind: "person" }, { id: 2, kind: "scene" }, { id: 3, kind: "scene" },
  { id: 4, kind: "scene" }, { id: 5, kind: "scene" },
];
const solo = defaultPlan(6, onePerson);
ok("with one person in the bank the cover still gets them",
  solo.slides[0].photoId === 1, `cover got ${solo.slides[0].photoId}`);
ok("and no slide is left empty", solo.slides.every((s) => s.photoId !== null),
  JSON.stringify(solo.slides.map((s) => s.photoId)));

// No people at all must not break anything: the bookends fall back to
// whatever the side layout accepts rather than coming back blank.
const noPeople = [
  { id: 20, kind: "scene" }, { id: 21, kind: "scene" }, { id: 22, kind: "scene" },
];
const faceless = defaultPlan(6, noPeople);
ok("a bank with no people still fills the bookends",
  faceless.slides[0].photoId !== null && faceless.slides[5].photoId !== null,
  JSON.stringify(faceless.slides.map((s) => s.photoId)));
ok("no photo repeats within a deck",
  new Set(p8.slides.map((s) => s.photoId)).size === 8,
  JSON.stringify(p8.slides.map((s) => s.photoId)));
ok("NO PERSON IS EVER PUT IN THE WIDE TOP STRIP",
  p8.slides.every((s) => s.layout !== "band" || kindOf(s.photoId) === "scene"),
  JSON.stringify(p8.slides.map((s) => `${s.layout}:${kindOf(s.photoId)}`)));
ok("cover and closing slide match",
  p8.slides[0].layout === "portrait" && p8.slides[7].layout === "portrait",
  `${p8.slides[0].layout}/${p8.slides[7].layout}`);
ok("the middle alternates",
  p8.slides.slice(1, 7).map((s) => s.layout).join(",") === "band,full,band,full,band,full",
  p8.slides.slice(1, 7).map((s) => s.layout).join(","));

const small = defaultPlan(5, [{ id: 7, kind: "person" }, { id: 8, kind: "scene" }]);
ok("a small bank fills every slide anyway",
  small.slides.every((s) => s.photoId !== null),
  JSON.stringify(small.slides.map((s) => s.photoId)));
ok("...and still keeps the person out of the band",
  small.slides.every((s) => s.layout !== "band" || s.photoId === 8),
  JSON.stringify(small.slides.map((s) => `${s.layout}:${s.photoId}`)));

ok("an empty bank gives empty slots, not a crash",
  defaultPlan(3, []).slides.every((s) => s.photoId === null), "");

// A bank with no scenes at all cannot fill a band, and must say so with
// an empty slot rather than a cropped face.
const noScenes = defaultPlan(3, [{ id: 1, kind: "person" }, { id: 2, kind: "person" }]);
ok("with no places in the bank, a band slide stays empty",
  noScenes.slides.filter((s) => s.layout === "band").every((s) => s.photoId === null),
  JSON.stringify(noScenes.slides.map((s) => `${s.layout}:${s.photoId}`)));

const chosen = {
  theme: "night",
  slides: [
    { layout: "full", photoId: 15, accent: "hey" },
    { layout: "plain", photoId: null, accent: "" },
  ],
};
const r = reconcile(chosen, 2, bank);
ok("a chosen photo is kept", r.slides[0].photoId === 15, String(r.slides[0].photoId));
ok("a text-only slide carries no photo", r.slides[1].photoId === null, String(r.slides[1].photoId));
ok("the chosen theme is kept", r.theme === "night", r.theme);

const grown = reconcile(chosen, 4, bank);
ok("slides added by a rewrite get a photo",
  grown.slides[2].photoId !== null && grown.slides[3].photoId !== null,
  JSON.stringify(grown.slides.map((s) => s.photoId)));
ok("...and the old choices still stand",
  grown.slides[0].photoId === 15 && grown.slides[1].photoId === null,
  JSON.stringify(grown.slides.map((s) => s.photoId)));
ok("a shorter rewrite drops the extra slides", reconcile(chosen, 1, bank).slides.length === 1, "");

const stale = {
  theme: "riseup",
  slides: [
    { layout: "portrait", photoId: null, accent: "" },
    { layout: "band", photoId: null, accent: "" },
    { layout: "full", photoId: null, accent: "" },
  ],
};
const healed = reconcile(stale, 3, bank);
ok("a plan from before photos existed fills itself in",
  healed.slides.every((s) => s.photoId !== null),
  JSON.stringify(healed.slides.map((s) => s.photoId)));
ok("...without repeating a photo",
  new Set(healed.slides.map((s) => s.photoId)).size === 3,
  JSON.stringify(healed.slides.map((s) => s.photoId)));

const collide = {
  theme: "riseup",
  slides: [
    { layout: "portrait", photoId: 12, accent: "" },
    { layout: "band", photoId: null, accent: "" },
    { layout: "full", photoId: 11, accent: "" },
    { layout: "band", photoId: null, accent: "" },
  ],
};
const fixed = reconcile(collide, 4, bank);
const picks = fixed.slides.map((s) => s.photoId);
ok("no photo appears twice after merging a stored plan",
  new Set(picks).size === picks.length, JSON.stringify(picks));
ok("...and the slides chosen by hand keep their photo",
  picks[0] === 12 && picks[2] === 11, JSON.stringify(picks));

// THE BUG AARON FOUND: a headshot stored on a band slide, cropped to a neck.
const cropped = reconcile(
  { theme: "riseup", slides: [{ layout: "band", photoId: 10, accent: "" }] }, 1, bank);
ok("a person stored on a band slide is swapped for a place",
  kindOf(cropped.slides[0].photoId) === "scene", JSON.stringify(cropped.slides));

const gone = reconcile(
  { theme: "riseup", slides: [{ layout: "full", photoId: 9999, accent: "" }] }, 1, bank);
ok("a photo deleted since the plan was made is replaced",
  gone.slides[0].photoId !== 9999 && gone.slides[0].photoId !== null,
  JSON.stringify(gone.slides));

ok("the band layout refuses people", !layoutAccepts("band", "person"), "band accepts person");
ok("the band layout takes places", layoutAccepts("band", "scene"), "band refuses scene");
ok("the side layout takes people", layoutAccepts("portrait", "person"), "portrait refuses person");

rmSync(out, { recursive: true, force: true });
console.log(f === 0 ? "\nslide plan: all checks passed.\n" : `\n${f} FAILURE(S)\n`);
process.exit(f === 0 ? 0 : 1);
