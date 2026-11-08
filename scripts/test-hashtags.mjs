#!/usr/bin/env node
/**
 * At most three hashtags, whatever the model returns.
 *
 * The prompt asks for three. The first real carousel came back with
 * twenty-five, because every caption the model has ever read ends in a
 * block of them. So the cap is enforced on the output too, and this is
 * what proves it.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(ROOT, "lib", "ideas", "generate.ts"), "utf8");
const MAX = Number(/MAX_HASHTAGS = (\d+)/.exec(src)[1]);

function capHashtags(caption, max = MAX) {
  const tag = /#[A-Za-z0-9_]+/g;
  let seen = 0;
  return caption.replace(tag, (m) => (++seen <= max ? m : ""))
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([.,!?])/g, "$1")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

let f = 0;
const ok = (l, c, d) => { console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${c ? "" : `\n          ${d}`}`); if (!c) f++; };
const count = (s) => (s.match(/#[A-Za-z0-9_]+/g) || []).length;

// The real caption from the first generated carousel.
const real = `To every broker and top producer who's tired of being a line item: this one's for you. Production is not the ceiling. It's the floor. If you're closing deals but building nothing you own, let's talk. DM me RISE and let's see what building a real team looks like. Grateful for this community every single day. Let's rise together. #RiseUpRealty #RISE #GRIT #YumaAZ #YumaRealEstate #eXpRealty #RealEstateRecruiting #TopProducer #BrokerLife #RealEstateAgent #TeamBuilding #LeadershipMindset #ArizonaRealEstate #RealEstateCareers #BuildAnEmpire #Entrepreneurship #VeteranOwned`;
ok(`the real 17-hashtag caption comes down to ${MAX}`, count(capHashtags(real)) === MAX, `${count(capHashtags(real))} left`);
ok("the first three are the ones kept",
  capHashtags(real).includes("#RiseUpRealty") && capHashtags(real).includes("#RISE") && capHashtags(real).includes("#GRIT"),
  capHashtags(real).slice(-80));
ok("the words before them survive intact",
  capHashtags(real).startsWith("To every broker and top producer"), capHashtags(real).slice(0, 50));
ok("no double spaces are left behind", !/ {2,}/.test(capHashtags(real)), JSON.stringify(capHashtags(real).slice(-60)));

ok("a caption with none is untouched", capHashtags("Just a caption.") === "Just a caption.", capHashtags("Just a caption."));
ok("a caption with exactly three is untouched",
  capHashtags("Hi #a #b #c") === "Hi #a #b #c", capHashtags("Hi #a #b #c"));
ok("a caption with four loses one", count(capHashtags("Hi #a #b #c #d")) === 3, capHashtags("Hi #a #b #c #d"));
ok("an empty caption stays empty", capHashtags("") === "", JSON.stringify(capHashtags("")));

// Inline tags count toward the limit but keep their sentence readable.
const inline = "This is why #RISE works for #agents who want #scale and #freedom and #more";
ok("inline hashtags are counted, not just trailing ones", count(capHashtags(inline)) === 3, capHashtags(inline));
ok("...and the sentence is not left with gaps",
  !/ {2,}/.test(capHashtags(inline)), JSON.stringify(capHashtags(inline)));

ok("normalize() applies the cap", /caption: capHashtags\(/.test(src), "generate.ts does not call capHashtags in normalize");
ok("the prompt also asks for it", /at most THREE/.test(src), "the shared RULES block lost the hashtag rule");

console.log(f === 0 ? `\nhashtags: all checks passed. Cap is ${MAX}.\n` : `\n${f} FAILURE(S)\n`);
process.exit(f === 0 ? 0 : 1);
