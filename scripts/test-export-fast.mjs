#!/usr/bin/env node
/**
 * The fast cutter, run for real in a browser.
 *
 * The other export plays the video and records the screen, which can
 * never beat real time and on Aaron's phone ran at 18.8 frames a second
 * with half second freezes. This one decodes the frames, keeps the wanted
 * ones, and encodes them again, so it runs at whatever speed the device
 * manages rather than at the speed the video happens to run.
 *
 * The source it builds is deliberately two-tone: dark everywhere except
 * the three seconds that are going to be cut, which are bright. A bright
 * frame in the finished video means the cut missed. The control run cuts
 * nothing and insists the bright frames ARE there, because a check that
 * only ever sees dark would pass whatever happened.
 *
 *   node scripts/test-export-fast.mjs
 *
 * Needs Playwright, a Chromium, and esbuild to bundle the module for the
 * page. Skips with a note rather than failing when any is missing.
 *
 * Worth knowing: a headless Chromium has no H.264 and no AAC, so it runs
 * this in VP9 and Opus. That exercises every line of the pipeline, which
 * is codec-agnostic, but it does NOT prove H.264 works on a phone. Only a
 * phone proves that.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { createRequire } from "node:module";


const PAGE = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><script type="module">
import './bundle.js';

// Ten seconds, dark everywhere except seconds 3 to 6, which are bright.
// Two tones rather than a ramp of greys: the encoder shifts grey levels
// about, and an earlier version of this test was reading that shift as a
// result. Dark against bright survives any amount of shifting.
async function makeSource() {
  const canvas = document.createElement('canvas');
  canvas.width = 540; canvas.height = 960;
  const g = canvas.getContext('2d');
  const ctx = new AudioContext();
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  const sink = ctx.createMediaStreamDestination();
  osc.connect(gain); gain.connect(sink); gain.gain.value = 0.3; osc.start();
  const stream = new MediaStream([
    ...canvas.captureStream(30).getVideoTracks(),
    ...sink.stream.getAudioTracks(),
  ]);
  // WebM on purpose: a headless Chromium has no H.264 decoder, so an mp4
  // from MediaRecorder could not be read back here.
  const type = ['video/webm;codecs=vp8,opus','video/webm']
    .find(t => MediaRecorder.isTypeSupported(t));
  const rec = new MediaRecorder(stream, { mimeType: type });
  const chunks = [];
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const start = performance.now();
  rec.start();
  await new Promise(done => {
    const draw = () => {
      const t = (performance.now() - start) / 1000;
      const inTheCut = t >= 3 && t < 6;
      g.fillStyle = inTheCut ? '#f0f0f0' : '#101010';
      g.fillRect(0, 0, 540, 960);
      if (t >= 10) { rec.stop(); done(); } else requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  });
  await new Promise(r => rec.onstop = r);
  ctx.close();
  return new Blob(chunks, { type });
}

function durationOf(blob) {
  return new Promise((res, rej) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      if (v.duration === Infinity || isNaN(v.duration)) {
        v.currentTime = 1e6;
        v.ontimeupdate = () => { v.ontimeupdate = null; res(v.duration); };
      } else res(v.duration);
    };
    v.onerror = () => rej(new Error('unreadable'));
    v.src = URL.createObjectURL(blob);
  });
}

/**
 * Where the bright stretch actually is in the recorded file.
 *
 * It is painted by wall clock while recording, which is not frame
 * accurate, so it lands near three to six seconds rather than exactly
 * there. An earlier version of this test assumed exactly, cut 3 to 6,
 * and then reported the leftover sliver as frames the cutter had failed
 * to remove. Measure it, cut that, and the check means something.
 */
window.findBright = async function () {
  const src = window.src || (window.src = await makeSource());
  const v = document.createElement('video');
  v.src = URL.createObjectURL(src);
  v.muted = true;
  await new Promise(ok => v.onloadeddata = ok);
  const seconds = await durationOf(src);
  const c = document.createElement('canvas');
  c.width = 540; c.height = 960;
  const g = c.getContext('2d');
  let first = null, last = null;
  for (let t = 0.05; t < seconds - 0.05; t += 0.05) {
    v.currentTime = t;
    await new Promise(ok => v.onseeked = ok);
    g.drawImage(v, 0, 0, 540, 960);
    if (g.getImageData(270, 480, 1, 1).data[0] > 128) {
      if (first === null) first = t;
      last = t;
    }
  }
  // Round outward to whole frames so the cut covers the whole stretch.
  return { start: first === null ? null : +(first - 0.05).toFixed(2),
           end: last === null ? null : +(last + 0.05).toFixed(2),
           sourceSeconds: +seconds.toFixed(2) };
};

window.chooseRouteSummary = async function () {
  const plan = await T.chooseRoute(540, 960);
  return { route: plan.route, reason: plan.reason, estimateFor10: plan.estimate(10) };
};

window.run = async function (cuts) {
  const src = window.src || (window.src = await makeSource());
  const format = await T.pickFastFormat(540, 960);
  const t0 = performance.now();
  const res = await T.cutFast([{ source: src, ranges: T.keepRanges(10, cuts) }], { format });
  const wall = (performance.now() - t0) / 1000;
  const seconds = await durationOf(res.blob);

  const v = document.createElement('video');
  v.src = URL.createObjectURL(res.blob);
  v.muted = true;
  await new Promise(ok => v.onloadeddata = ok);
  const c = document.createElement('canvas');
  c.width = 540; c.height = 960;
  const g = c.getContext('2d');
  let bright = 0, sampled = 0;
  for (let t = 0.15; t < seconds - 0.15; t += 0.2) {
    v.currentTime = t;
    await new Promise(ok => v.onseeked = ok);
    g.drawImage(v, 0, 0, 540, 960);
    sampled++;
    if (g.getImageData(270, 480, 1, 1).data[0] > 128) bright++;
  }

  let frames = [];
  if (typeof v.requestVideoFrameCallback === 'function') {
    v.currentTime = 0;
    await new Promise(done => {
      const step = (n, m) => {
        frames.push(m.mediaTime);
        if (v.ended || frames.length > 2000) done();
        else v.requestVideoFrameCallback(step);
      };
      v.requestVideoFrameCallback(step);
      v.onended = done;
      v.play();
    });
  }
  let longestHold = 0;
  for (let i = 1; i < frames.length; i++) {
    longestHold = Math.max(longestHold, frames[i] - frames[i - 1]);
  }

  let audioPeak = null;
  try {
    const actx = new AudioContext();
    const buf = await actx.decodeAudioData(await res.blob.arrayBuffer());
    const d = buf.getChannelData(0);
    let p = 0;
    for (let i = 0; i < d.length; i += 10) p = Math.max(p, Math.abs(d[i]));
    audioPeak = +p.toFixed(3);
    actx.close();
  } catch (e) { audioPeak = 'could not read: ' + e.message; }

  return {
    seconds: +seconds.toFixed(2), wall: +wall.toFixed(1), bytes: res.blob.size,
    bright, sampled, audioPeak,
    fps: frames.length ? +(frames.length / seconds).toFixed(1) : null,
    longestHold: +longestHold.toFixed(3),
  };
};
<\/script></body></html>`;

const PLAYWRIGHT_PATHS = ["playwright", "/opt/npm-tools/node_modules/playwright"];

function loadPlaywright() {
  const require_ = createRequire(import.meta.url);
  for (const p of PLAYWRIGHT_PATHS) {
    try {
      return require_(p).chromium;
    } catch {
      // try the next one
    }
  }
  return null;
}

const chromium = loadPlaywright();
if (!chromium) {
  console.log("\nFast cutter: SKIPPED (Playwright is not installed here).\n");
  process.exit(0);
}
if (!existsSync("node_modules/mediabunny")) {
  console.log("\nFast cutter: SKIPPED (mediabunny is not installed; run npm install).\n");
  process.exit(0);
}

const dir = mkdtempSync(join(tmpdir(), "cs-fast-"));
writeFileSync(
  join(dir, "entry.ts"),
  `import { cutFast, canCutFast, pickFastFormat } from ${JSON.stringify(process.cwd() + "/lib/session/export-codecs")};
import { chooseRoute, cutPieces } from ${JSON.stringify(process.cwd() + "/lib/session/export")};
import { keepRanges } from ${JSON.stringify(process.cwd() + "/lib/session/recut")};
(window as unknown as { T: unknown }).T = { cutFast, canCutFast, pickFastFormat, chooseRoute, cutPieces, keepRanges };
`,
);

const built = await new Promise((resolve) => {
  const esbuild = spawn(
    "npx",
    ["--yes", "esbuild", join(dir, "entry.ts"), "--bundle", "--format=esm",
     `--outfile=${join(dir, "bundle.js")}`, "--log-level=error"],
    { stdio: "inherit", cwd: process.cwd() },
  );
  esbuild.on("exit", (code) => resolve(code === 0));
  esbuild.on("error", () => resolve(false));
});
if (!built) {
  console.log("\nFast cutter: SKIPPED (esbuild could not bundle the module).\n");
  process.exit(0);
}

writeFileSync(join(dir, "index.html"), PAGE);

const server = createServer((req, res) => {
  const name = (req.url || "/").split("?")[0].replace(/^\//, "") || "index.html";
  try {
    const body = readFileSync(join(dir, name));
    res.writeHead(200, {
      "content-type": name.endsWith(".js") ? "text/javascript" : "text/html",
    });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;

let passed = 0;
const failures = [];
function check(label, ok, detail) {
  if (ok) { passed++; console.log(`  PASS  ${label}`); }
  else { failures.push(label); console.log(`  FAIL  ${label}${detail ? `\n          ${detail}` : ""}`); }
}

console.log("\nCutting without playing it back\n");

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
try {
  const page = await (await browser.newContext()).newPage();
  page.on("pageerror", (e) => console.log("  PAGE ERROR:", e.message));
  await page.goto(`${base}/index.html`);

  const format = await page.evaluate(() => T.pickFastFormat(540, 960));
  console.log(
    `  NOTE  this browser cuts in ${format?.videoCodec ?? "nothing"} and ` +
      `${format?.audioCodec ?? "nothing"}${format?.postable ? ", which Instagram takes." : ", which Instagram refuses, so the app would use the slower route here."}`,
  );
  check("the browser can run the fast cutter at all", Boolean(format));

  // Find the bright stretch in the file as recorded, rather than assuming
  // it landed exactly where it was painted.
  const bright = await page.evaluate(() => findBright());
  console.log(
    `  NOTE  the part to remove sits at ${bright.start}s to ${bright.end}s ` +
      `of a ${bright.sourceSeconds}s clip`,
  );
  check("the clip to cut has a part to remove in it", bright.start !== null);

  const cut = await page.evaluate((b) => run([{ start: b.start, end: b.end }]), bright);
  const control = await page.evaluate(() => run([]));
  const expected = bright.sourceSeconds - (bright.end - bright.start);

  console.log("\n  Cutting the marked stretch out");
  check(
    "the finished video is shorter by exactly what was removed",
    Math.abs(cut.seconds - expected) < 0.4,
    `came out ${cut.seconds}s, expected about ${expected.toFixed(2)}s`,
  );
  check(
    "nothing from the removed seconds is in it",
    cut.bright === 0,
    `${cut.bright} of ${cut.sampled} sampled frames came from the part that was cut`,
  );
  check("it has sound", typeof cut.audioPeak === "number" && cut.audioPeak > 0.01,
    `peak level ${cut.audioPeak}`);
  check("the file is not empty", cut.bytes > 1000, `${cut.bytes} bytes`);

  console.log("\n  Control: the same clip with nothing cut");
  check(
    "the finished video is about ten seconds",
    Math.abs(control.seconds - 10) < 0.5,
    `came out ${control.seconds}s`,
  );
  check(
    "the bright frames ARE there, so the check above can tell the difference",
    control.bright > 0,
    "the check never sees a bright frame, so it proves nothing",
  );

  console.log("\n  Choosing a route");
  const plan = await page.evaluate(() => chooseRouteSummary());
  console.log(`  NOTE  this browser is routed to: ${plan.route}`);
  check(
    "a browser without H.264 is not sent down the fast route",
    plan.route === "playback",
    `routed to ${plan.route}; this one cannot write a postable file quickly`,
  );
  check(
    "...and is told why, rather than left wondering",
    typeof plan.reason === "string" && plan.reason.length > 20,
    `reason given: ${JSON.stringify(plan.reason)}`,
  );
  check(
    "the waiting time quoted matches the route",
    plan.estimateFor10 === "about 10 seconds",
    `quoted ${JSON.stringify(plan.estimateFor10)} for ten seconds of video on the slow route`,
  );

  console.log("\n  The reason for doing it this way");
  check(
    "it finishes faster than the video is long",
    cut.wall < cut.seconds,
    `took ${cut.wall}s to make ${cut.seconds}s of video, which is no better than playing it`,
  );
  check(
    "every frame is there, not two thirds of them",
    cut.fps !== null && cut.fps >= 24,
    `came out at ${cut.fps} frames a second`,
  );
  check(
    "the picture never sits still",
    cut.longestHold < 0.12,
    `the longest it holds one frame is ${cut.longestHold}s`,
  );
} finally {
  await browser.close();
  server.close();
}

console.log(
  failures.length === 0
    ? `\nAll ${passed} checks passed.\n`
    : `\n${failures.length} FAILURE(S), ${passed} passed.\n`,
);
process.exit(failures.length === 0 ? 0 : 1);
