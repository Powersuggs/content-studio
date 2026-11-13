#!/usr/bin/env node
/**
 * Anywhere he would otherwise type, he can speak instead.
 *
 * Aaron: "every text box in the app must accept voice, not just the
 * voice-interview feature: he wants to speak and record his thoughts
 * anywhere he would otherwise have to type".
 *
 * Not literally every box. A mic on a field that wants an exact token, a
 * web address or a password is worse than no mic: it looks like it
 * works, produces something close but wrong, and the thing it feeds
 * silently ignores it. That is the same fault as the full screen button
 * that did nothing, and he found that one himself.
 *
 * So the rule is: any screen with a box he writes his own words into
 * carries a mic, and every screen without one is listed below with the
 * reason. A new text box in a file that is neither gets caught here
 * rather than a year later.
 *
 *   node scripts/check-voice-everywhere.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Screens with a text box and deliberately no microphone.
 *
 * The reason matters more than the entry. If one of these grows a box he
 * actually composes in, move it out of the list rather than widening the
 * reason.
 */
const NO_MIC_ON_PURPOSE = {
  "app/login/page.tsx": "an email and a password",
  "app/setup/page.tsx": "an email and a password",
  "app/signup/page.tsx": "an email and a password",
  "components/settings/SocialHandles.tsx":
    "a handle, which has to be exactly right and is nine characters",
  "components/settings/InviteCodes.tsx": "switches and buttons, no prose",
  "components/game-plan/GamePlanForm.tsx": "dates and numbers",
  "components/ideas/SlideStudio.tsx":
    "the phrase must appear in the slide word for word, and dictation gets close rather than exact, so the slide would quietly ignore it",
  "components/posts/PillarTag.tsx":
    "a short label with a list of suggestions under it, inline in a row with no space",
  "components/inspiration/BulkImportForm.tsx": "a list of web addresses",
  "components/voice/VoiceInterview.tsx":
    "already has a recorder of its own wired to the same box",
};

/** Field types with nothing to dictate into. */
const NOT_TEXT = ["button", "submit", "checkbox", "radio", "range", "file", "hidden", "color"];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (name.endsWith(".tsx")) out.push(path);
  }
  return out;
}

let passed = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) { passed++; console.log(`  PASS  ${label}`); }
  else { failures.push(label); console.log(`  FAIL  ${label}${detail ? `\n          ${detail}` : ""}`); }
}

console.log("\nSpeaking instead of typing\n");

const files = [...walk("components"), ...walk("app")].sort();
const missing = [];
const stale = new Set(Object.keys(NO_MIC_ON_PURPOSE));

for (const file of files) {
  const source = readFileSync(file, "utf8");

  // Does this screen have a box someone could write words into?
  const hasTextarea = /<textarea/.test(source);
  const inputs = source.match(/<input\b[^>]*>/gs) ?? [];
  const typedInputs = inputs.filter((tag) => {
    const type = /type="([a-z]+)"/.exec(tag)?.[1];
    return !type || !NOT_TEXT.includes(type);
  });
  if (!hasTextarea && typedInputs.length === 0) continue;

  stale.delete(file);
  if (/<MicButton\b/.test(source)) continue;
  if (file in NO_MIC_ON_PURPOSE) continue;
  missing.push(file);
}

check(
  "every screen he writes his own words on has a microphone",
  missing.length === 0,
  missing.length
    ? `no mic and no reason given:\n          ${missing.join("\n          ")}\n          Add one, or list it in NO_MIC_ON_PURPOSE with why.`
    : undefined,
);

check(
  "nothing is excused that no longer has a text box",
  stale.size === 0,
  `these are listed as deliberately mic-free but have no text box any more: ${[...stale].join(", ")}`,
);

// The button has to leave the caret alone, or a field that saves when it
// loses focus closes the moment the mic is tapped. The profile bio does
// exactly that.
const button = readFileSync("components/voice/MicButton.tsx", "utf8");
check(
  "the microphone does not steal focus from the box beside it",
  /onMouseDown=\{keepFocus\}/.test(button),
  "a field that saves on blur would close itself when the mic is pressed",
);
check(
  "speaking adds to what is already typed rather than replacing it",
  /existing \? `\$\{existing\} \$\{text\}` : text/.test(button),
  "someone who typed half a thought and then spoke meant to continue",
);

const withMic = files.filter((f) => /<MicButton\b/.test(readFileSync(f, "utf8")));
console.log(`\n  ${withMic.length} screens can be spoken into:`);
for (const f of withMic) console.log(`     ${f.replace("components/", "")}`);
console.log(`\n  ${Object.keys(NO_MIC_ON_PURPOSE).length} left alone on purpose:`);
for (const [f, why] of Object.entries(NO_MIC_ON_PURPOSE)) {
  console.log(`     ${f.replace("components/", "").replace("app/", "")}: ${why}`);
}

console.log(
  failures.length === 0
    ? `\nAll ${passed} checks passed.\n`
    : `\n${failures.length} FAILURE(S), ${passed} passed.\n`,
);
process.exit(failures.length === 0 ? 0 : 1);
