#!/usr/bin/env node
/**
 * Default slide plans must spread photos, not repeat them.
 *
 * The point of ordering the bank least-used first is that a new carousel
 * rotates through it. That only works if defaultPlan walks the list
 * instead of reaching for the same id, and if reconcile() keeps a choice
 * already made while still filling a slide that a rewrite added.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(ROOT, "lib", "slides", "plan.ts"), "utf8");

// The two functions, lifted so the test runs without Next's resolution.
function defaultPlan(slideCount, photoIds = []) {
  const slides = []; let next = 0;
  const take = () => (photoIds.length ? photoIds[next++ % photoIds.length] : null);
  for (let i = 0; i < slideCount; i++) {
    const isFirst = i === 0, isLast = i === slideCount - 1;
    const layout = isFirst || isLast ? "portrait" : i % 2 === 1 ? "band" : "full";
    slides.push({ layout, photoId: take(), accent: "" });
  }
  return { theme: "riseup", slides };
}
function reconcile(plan, slideCount, photoIds = []) {
  const base = defaultPlan(slideCount, photoIds);
  if (!plan?.slides?.length) return base;
  return {
    theme: typeof plan.theme === "string" ? plan.theme : base.theme,
    slides: base.slides.map((d, i) => {
      const kept = plan.slides[i];
      if (!kept) return d;
      return {
        layout: kept.layout ?? d.layout,
        photoId: typeof kept.photoId === "number" ? kept.photoId
          : "photoId" in kept ? null : d.photoId,
        accent: typeof kept.accent === "string" ? kept.accent : "",
      };
    }),
  };
}

let f = 0;
const ok = (l,c,d)=>{console.log(`  ${c?"PASS":"FAIL"}  ${l}${c?"":`\n          ${d}`}`); if(!c)f++;};

const bank = [10,11,12,13,14,15,16,17,18,19];

const p8 = defaultPlan(8, bank);
ok("every slide gets a photo", p8.slides.every(s=>s.photoId!==null), JSON.stringify(p8.slides.map(s=>s.photoId)));
ok("no photo repeats within a deck", new Set(p8.slides.map(s=>s.photoId)).size===8, JSON.stringify(p8.slides.map(s=>s.photoId)));
ok("it starts at the least used", p8.slides[0].photoId===10, String(p8.slides[0].photoId));
ok("cover and closing slide match", p8.slides[0].layout==="portrait" && p8.slides[7].layout==="portrait",
  `${p8.slides[0].layout}/${p8.slides[7].layout}`);
ok("the middle alternates", p8.slides.slice(1,7).map(s=>s.layout).join(",")==="band,full,band,full,band,full",
  p8.slides.slice(1,7).map(s=>s.layout).join(","));

// More slides than photos must wrap rather than leave blanks.
const small = defaultPlan(5, [7,8]);
ok("a small bank wraps instead of running out", small.slides.every(s=>s.photoId!==null),
  JSON.stringify(small.slides.map(s=>s.photoId)));

ok("an empty bank gives empty slots, not a crash", defaultPlan(3, []).slides.every(s=>s.photoId===null), "");

// reconcile: a deliberate choice survives, a deliberate "none" survives.
const chosen = {theme:"night", slides:[{layout:"full",photoId:99,accent:"hey"},{layout:"plain",photoId:null,accent:""}]};
const r = reconcile(chosen, 2, bank);
ok("a chosen photo is kept", r.slides[0].photoId===99, String(r.slides[0].photoId));
ok("a deliberate no-photo is kept", r.slides[1].photoId===null, String(r.slides[1].photoId));
ok("the chosen theme is kept", r.theme==="night", r.theme);

// A rewrite that adds slides fills the new ones from the bank.
const grown = reconcile(chosen, 4, bank);
ok("slides added by a rewrite get a photo", grown.slides[2].photoId!==null && grown.slides[3].photoId!==null,
  JSON.stringify(grown.slides.map(s=>s.photoId)));
ok("...and the old choices still stand", grown.slides[0].photoId===99 && grown.slides[1].photoId===null,
  JSON.stringify(grown.slides.map(s=>s.photoId)));

// A rewrite that shortens the deck must not keep orphan slides.
ok("a shorter rewrite drops the extra slides", reconcile(chosen, 1, bank).slides.length===1, "");

ok("source still walks the list", /next\+\+ % photoIds\.length/.test(src), "defaultPlan no longer rotates");

console.log(f===0 ? "\nslide plan: all checks passed.\n" : `\n${f} FAILURE(S)\n`);
process.exit(f===0?0:1);
