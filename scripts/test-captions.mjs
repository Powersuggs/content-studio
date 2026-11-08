#!/usr/bin/env node
/**
 * Captions: at most three hashtags, and none at all where the medium has
 * no caption.
 *
 * Compiles lib/ideas/generate.ts and imports it, rather than copying the
 * logic. The file this replaces copied capHashtags by hand, which is the
 * same trap the slide planner's test fell into: the copy drifts, the test
 * keeps passing, and it is reporting on code that is no longer there.
 *
 * A tsconfig is generated so the "@/..." import resolves exactly as it
 * does in the app, and a compile error fails the run instead of being
 * emitted through.
 *
 *   node scripts/test-captions.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = mkdtempSync(join(tmpdir(), "captions-"));
const cfg = join(out, "tsconfig.json");

writeFileSync(cfg, JSON.stringify({
  compilerOptions: {
    target: "es2022", module: "es2022", moduleResolution: "bundler",
    outDir: out, rootDir: ROOT, baseUrl: ROOT, paths: { "@/*": ["./*"] },
    skipLibCheck: true, noEmitOnError: true,
  },
  files: [join(ROOT, "lib/ideas/generate.ts")],
}));

try {
  execFileSync("npx", ["tsc", "-p", cfg], { cwd: ROOT, stdio: "pipe" });
} catch (e) {
  console.error("Could not compile generate.ts:\n" + (e.stdout?.toString() ?? e.message));
  process.exit(1);
}

const { capHashtags, normalize, MAX_HASHTAGS: MAX } =
  await import(pathToFileURL(join(out, "lib/ideas/generate.js")).href);

let f = 0;
const ok = (l, c, d) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${c ? "" : `\n          ${d}`}`);
  if (!c) f++;
};
const count = (s) => (s.match(/#[A-Za-z0-9_]+/g) || []).length;

// ------------------------------------------------------------ the cap
// The real caption from the first generated carousel, 17 hashtags.
const real = `To every broker and top producer who's tired of being a line item: this one's for you. Production is not the ceiling. It's the floor. If you're closing deals but building nothing you own, let's talk. DM me RISE and let's see what building a real team looks like. #RiseUpTeam #RISE #GRIT #YumaAZ #YumaRealEstate #eXpRealty #RealEstateRecruiting #TopProducer #BrokerLife #RealEstateAgent #TeamBuilding #LeadershipMindset #ArizonaRealEstate #RealEstateCareers #BuildAnEmpire #Entrepreneurship #VeteranOwned`;
ok(`a 17-hashtag caption comes down to ${MAX}`, count(capHashtags(real)) === MAX,
  `${count(capHashtags(real))} left`);
ok("the first three are the ones kept",
  ["#RiseUpTeam", "#RISE", "#GRIT"].every((t) => capHashtags(real).includes(t)),
  capHashtags(real).slice(-80));
ok("the words before them survive intact",
  capHashtags(real).startsWith("To every broker and top producer"),
  capHashtags(real).slice(0, 50));
ok("a hashtag inside a sentence is left where it is",
  capHashtags("this is why #RISE works for us").includes("why #RISE works"),
  capHashtags("this is why #RISE works for us"));
ok("a caption already within the cap is untouched",
  capHashtags("Three only. #a #b #c") === "Three only. #a #b #c",
  capHashtags("Three only. #a #b #c"));

// -------------------------------------------- captions that should not exist
const withTags = { title: "Frame one", parts: ["two", "three"], body: "",
  caption: "#eXpRealty #RiseUpTeam #RealEstateAgent", notes: "question sticker on frame 2" };

ok("A STORY COMES BACK WITH NO CAPTION",
  normalize({ ...withTags }, "story").caption === "",
  JSON.stringify(normalize({ ...withTags }, "story").caption));
ok("a thread comes back with no caption",
  normalize({ ...withTags }, "thread").caption === "", "thread kept one");
ok("an email comes back with no caption",
  normalize({ ...withTags }, "email").caption === "", "email kept one");
ok("a carousel keeps its caption",
  normalize({ ...withTags }, "carousel").caption === "#eXpRealty #RiseUpTeam #RealEstateAgent",
  normalize({ ...withTags }, "carousel").caption);
ok("a reel keeps its caption", normalize({ ...withTags }, "reel").caption !== "", "reel lost it");
ok("a blog keeps its meta description",
  normalize({ ...withTags, caption: "A meta description." }, "blog").caption === "A meta description.",
  "blog lost it");
ok("a stored draft with no format given keeps whatever it had",
  normalize({ ...withTags }).caption === "#eXpRealty #RiseUpTeam #RealEstateAgent",
  "an old row lost its caption");
ok("the story's frames are untouched by any of this",
  normalize({ ...withTags }, "story").parts.length === 2, "frames went missing");

// --------------------------------------------- the carousel's closing ask
const src = execFileSync("cat", [join(ROOT, "lib/ideas/generate.ts")]).toString();
const carouselBrief = src.slice(src.indexOf("carousel: {"), src.indexOf("story: {"));
ok("THE CAROUSEL BRIEF DEMANDS THE ASK ON THE LAST SLIDE",
  /last slide must carry the ask itself/.test(carouselBrief), "the wording moved");
ok("and says the caption may not be its only home",
  /not be the only place/.test(carouselBrief), "the wording moved");

console.log(f === 0 ? "\ncaptions: all checks passed." : `\ncaptions: ${f} FAILED.`);
process.exit(f === 0 ? 0 : 1);
