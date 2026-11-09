#!/usr/bin/env node
/**
 * The export engine, run for real in a browser.
 *
 * scripts/test-recut.mjs checks the arithmetic. This checks the thing the
 * arithmetic drives: play a video back, skip the cut parts, record the
 * result, and end up with a file that is shorter by exactly the right
 * amount and missing exactly the right seconds.
 *
 * It builds its own source video in the page: nine seconds, with sound for
 * 0 to 3 and 6 to 9 and silence in between, painted GREEN while there is
 * sound and GREY while there is not. Then it cuts the silent middle and
 * looks at the finished frames. A grey frame means the cut missed.
 *
 * The control run matters as much as the test. It exports the same video
 * with NO cuts and insists the grey frames ARE there. Without that, a
 * detector that always answered "green" would pass the main test and
 * prove nothing. That has happened in this project before.
 *
 *   node scripts/test-export-browser.mjs
 *
 * Needs Playwright and a Chromium. Skips with a note rather than failing
 * when they are absent, so it never blocks a machine that has neither.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { createRequire } from "node:module";


const PAGE = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><script type="module">
import { exportCut, canExport, pickExportType } from './export-video.js';
import { keepRanges } from './recut.js';
window.T = { exportCut, canExport, pickExportType, keepRanges };

// Nine seconds. Sound for 0 to 3 and 6 to 9, silence between. Painted
// green while there is sound and grey while there is not, so the finished
// frames say for themselves which part of the source they came from.
async function makeSource() {
  const canvas = document.createElement('canvas');
  canvas.width = 240; canvas.height = 320;
  const g = canvas.getContext('2d');
  const ctx = new AudioContext();
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  const sink = ctx.createMediaStreamDestination();
  osc.connect(gain); gain.connect(sink); gain.gain.value = 0; osc.start();
  const stream = new MediaStream([
    ...canvas.captureStream(30).getVideoTracks(),
    ...sink.stream.getAudioTracks(),
  ]);
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
      const loud = t < 3 || t > 6;
      gain.gain.value = loud ? 0.4 : 0;
      g.fillStyle = loud ? '#00aa00' : '#222222';
      g.fillRect(0, 0, 240, 320);
      if (t >= 9) { rec.stop(); done(); } else requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  });
  await new Promise(r => rec.onstop = r);
  ctx.close();
  return new Blob(chunks, { type });
}

// MediaRecorder output often carries no duration in its header, so the
// browser is made to work it out by seeking past the end.
function durationOf(blob) {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      if (v.duration === Infinity || isNaN(v.duration)) {
        v.currentTime = 1e6;
        v.ontimeupdate = () => { v.ontimeupdate = null; resolve(v.duration); };
      } else resolve(v.duration);
    };
    v.onerror = () => reject(new Error('could not read the exported video'));
    v.src = URL.createObjectURL(blob);
  });
}

window.run = async function (cuts) {
  const src = window.src || (window.src = await makeSource());
  const res = await exportCut(src, keepRanges(9, cuts));
  const measured = await durationOf(res.blob);
  const v = document.createElement('video');
  v.src = URL.createObjectURL(res.blob); v.muted = true;
  await new Promise(ok => v.onloadeddata = ok);
  const c = document.createElement('canvas');
  c.width = 240; c.height = 320;
  const g = c.getContext('2d');
  // Sample across the finished video, staying clear of the very ends.
  const points = [];
  for (let i = 1; i <= 8; i++) points.push((measured * i) / 9);
  let grey = 0;
  for (const t of points) {
    v.currentTime = t;
    await new Promise(ok => v.onseeked = ok);
    g.drawImage(v, 0, 0, 240, 320);
    if (g.getImageData(20, 300, 1, 1).data[1] < 80) grey++;
  }
  return { measured, grey, sampled: points.length, bytes: res.blob.size, type: res.type };
};
<\/script></body></html>`;

const PLAYWRIGHT_PATHS = ["playwright", "/opt/npm-tools/node_modules/playwright"];

async function loadPlaywright() {
  // Playwright ships as CommonJS, so it is required rather than imported.
  // An absolute path matters here: it is usually installed alongside the
  // tooling rather than in this project.
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

const chromium = await loadPlaywright();
if (!chromium) {
  console.log("\nExport engine: SKIPPED (Playwright is not installed here).\n");
  process.exit(0);
}

// Compile the two modules the page needs. Done with the project's own
// TypeScript so the test runs against the real source, not a copy.
const dir = mkdtempSync(join(tmpdir(), "cs-export-"));
await new Promise((resolve, reject) => {
  const tsc = spawn(
    "npx",
    ["tsc", "lib/session/recut.ts", "lib/session/export-video.ts",
     "--outDir", dir, "--target", "es2020", "--module", "es2020",
     "--moduleResolution", "bundler", "--skipLibCheck", "--lib", "es2020,dom"],
    { stdio: "inherit" },
  );
  tsc.on("exit", (code) => (code === 0 ? resolve() : reject(new Error("tsc failed"))));
});
// The emitted import has no extension, which a browser will not resolve.
const ev = join(dir, "export-video.js");
writeFileSync(ev, readFileSync(ev, "utf8").replace(/(['"])\.\/recut\1/g, "$1./recut.js$1"));
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

console.log("\nExport engine, in a real browser\n");

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
try {
  const page = await (await browser.newContext()).newPage();
  page.on("pageerror", (e) => console.log("  PAGE ERROR:", e.message));
  await page.goto(`${base}/index.html`);

  const probe = await page.evaluate(() => T.canExport());
  check("the browser reports it can export", probe.ok, probe.reason ?? "");

  const cut = await page.evaluate(() => run([{ start: 3, end: 6 }]));
  const control = await page.evaluate(() => run([]));

  console.log("\n  Cutting the silent middle out of a 9 second take");
  check(
    "the finished video is about 6 seconds",
    Math.abs(cut.measured - 6) < 0.3,
    `came out ${cut.measured.toFixed(2)}s`,
  );
  check(
    "no silent frame survived the cut",
    cut.grey === 0,
    `${cut.grey} of ${cut.sampled} sampled frames came from the silent part`,
  );
  check("the file is not empty", cut.bytes > 1000, `${cut.bytes} bytes`);
  // Not an assertion. Which format a browser will write is the browser's
  // decision, and Firefox only offers WebM, which Instagram refuses. That
  // is a fact to report, not a failure to hide behind a check that cannot
  // fail. The app tells him the same thing at save time.
  console.log(
    /webm/i.test(cut.type)
      ? `  NOTE  written as ${cut.type}. Instagram refuses WebM, so this browser's exports cannot be posted directly.`
      : `  NOTE  written as ${cut.type}, which Instagram accepts.`,
  );

  console.log("\n  Control: the same take with nothing cut");
  check(
    "the finished video is about 9 seconds",
    Math.abs(control.measured - 9) < 0.4,
    `came out ${control.measured.toFixed(2)}s`,
  );
  check(
    "the silent frames ARE there, so the check above can tell the difference",
    control.grey > 0,
    "the detector never sees grey, so the test above proves nothing",
  );
} finally {
  await browser.close();
  server.close();
}

console.log(
  failures.length === 0
    ? `\nAll ${passed} checks passed. The cut lands where it should.\n`
    : `\n${failures.length} FAILURE(S), ${passed} passed.\n`,
);
process.exit(failures.length === 0 ? 0 : 1);
