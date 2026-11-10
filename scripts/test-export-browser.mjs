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
import { exportCut, exportSequence, canExport, pickExportType } from './export-video.js';
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

// A short solid-colour piece, with sound throughout, at a given size.
// Two different sizes on purpose: joining pieces filmed in different
// shapes must letterbox them, not stretch them.
async function makePiece(seconds, colour, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const g = canvas.getContext('2d');
  const ctx = new AudioContext();
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  const sink = ctx.createMediaStreamDestination();
  osc.connect(gain); gain.connect(sink); gain.gain.value = 0.3; osc.start();
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
      g.fillStyle = colour; g.fillRect(0, 0, w, h);
      if (t >= seconds) { rec.stop(); done(); } else requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  });
  await new Promise(r => rec.onstop = r);
  ctx.close();
  return new Blob(chunks, { type });
}

window.runJoin = async function () {
  const a = await makePiece(4, '#00aa00', 240, 320);   // green, tall
  const b = await makePiece(3, '#0000cc', 320, 240);   // blue, wide
  const res = await exportSequence([
    { source: a, ranges: [{ start: 0, end: 4 }] },
    { source: b, ranges: [{ start: 0, end: 3 }] },
  ]);
  const measured = await durationOf(res.blob);
  const v = document.createElement('video');
  v.src = URL.createObjectURL(res.blob); v.muted = true;
  await new Promise(ok => v.onloadeddata = ok);
  const c = document.createElement('canvas');
  c.width = 240; c.height = 320;
  const g = c.getContext('2d');
  const at = async (t) => {
    v.currentTime = t;
    await new Promise(ok => v.onseeked = ok);
    g.drawImage(v, 0, 0, 240, 320);
    // Sample the middle, where a letterboxed piece still has picture.
    const d = g.getImageData(120, 160, 1, 1).data;
    return d[2] > d[1] ? 'blue' : (d[1] > 60 ? 'green' : 'black');
  };
  return {
    measured,
    bytes: res.blob.size,
    early: await at(1),
    late: await at(Math.max(0, measured - 1)),
  };
};

// Read the finished sound and measure how violently it moves at the join
// compared with how it moves normally. A cut made by chopping a waveform
// at an arbitrary sample leaves a step, and a step is a click.
// Export a big source and report the size and frame rate of the result.
// Aaron's first real export was 1920x1080 and averaged 21 frames a second
// with seven half second freezes, because a phone cannot paint and encode
// two million pixels in real time while playing the video back.
window.bigSourceExport = async function () {
  const src = await makePiece(4, '#00aa00', 1920, 1080);
  const t0 = performance.now();
  const res = await exportCut(src, keepRanges(4, []));
  const wall = (performance.now() - t0) / 1000;
  const v = document.createElement('video');
  v.src = URL.createObjectURL(res.blob);
  v.muted = true;
  await new Promise(ok => v.onloadeddata = ok);
  const measured = await durationOf(res.blob);

  // Play the result and time every frame. An average alone hides the
  // thing that actually looks wrong: a video that holds 24 a second and
  // then stops dead for a third of a second averages fine and watches
  // badly.
  let frames = [];
  if (typeof v.requestVideoFrameCallback === 'function') {
    await new Promise(done => {
      const step = (now, meta) => {
        frames.push(meta.mediaTime);
        if (v.ended || frames.length > 2000) done();
        else v.requestVideoFrameCallback(step);
      };
      v.requestVideoFrameCallback(step);
      v.onended = done;
      v.muted = true;
      v.play();
    });
  }
  let longestHold = 0;
  for (let i = 1; i < frames.length; i++) {
    longestHold = Math.max(longestHold, frames[i] - frames[i - 1]);
  }
  return {
    width: v.videoWidth, height: v.videoHeight,
    sourceWidth: 1920, sourceHeight: 1080,
    seconds: measured, wall: +wall.toFixed(1), bytes: res.blob.size,
    frames: frames.length, longestHold: +longestHold.toFixed(3),
    fps: frames.length ? +(frames.length / measured).toFixed(1) : null,
  };
};

window.audioAtJoin = async function (joinAt) {
  // A source with one unbroken tone all the way through, NOT the one with
  // deliberate silences in it.
  //
  // The first version of this check used that one and failed, because
  // that source switches its tone on and off with no ramp, so it has a
  // step of its own at exactly the second being joined to. It was
  // measuring the test material's click, not the export's. With an
  // unbroken tone, any step at the join can only have been put there by
  // the cutting.
  const src = await makePiece(9, '#00aa00', 240, 320);
  const res = await exportCut(src, keepRanges(9, [{ start: 3, end: 6 }]));
  const ctx = new AudioContext();
  const buf = await ctx.decodeAudioData(await res.blob.arrayBuffer());
  const d = buf.getChannelData(0);
  const worstBetween = (from, to) => {
    let worst = 0;
    const a = Math.max(1, Math.floor(from * buf.sampleRate));
    const b = Math.min(d.length, Math.floor(to * buf.sampleRate));
    for (let i = a; i < b; i++) worst = Math.max(worst, Math.abs(d[i] - d[i - 1]));
    return worst;
  };
  const out = {
    audioSeconds: buf.duration,
    atTheJoin: worstBetween(joinAt - 0.08, joinAt + 0.08),
    // What this signal does between neighbouring samples when nothing is
    // being cut, which is the only fair thing to compare the join with.
    typical: worstBetween(0.2, 2.5),
  };
  ctx.close();
  return out;
};

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
  console.log("\n  The sound across the join");
  // The cut removes 3s to 6s, so in the finished file the join sits at 3s.
  const sound = await page.evaluate(() => audioAtJoin(3));
  // Four, not two. Measured across repeated runs on working code the
  // ratio sits between about 0.7 and 2.1, because the encoder's own noise
  // moves it; the broken version measured 9.8. A limit of two sat inside
  // that spread and failed on a good build, which is a test that cries
  // wolf rather than a test.
  check(
    "the sound does not jump at the cut",
    sound.atTheJoin <= sound.typical * 4,
    `the step at the join is ${sound.atTheJoin.toFixed(4)} against a normal ${sound.typical.toFixed(4)}, ` +
      `which is ${(sound.atTheJoin / sound.typical).toFixed(1)} times bigger and is heard as a click`,
  );
  check(
    "the sound and the picture are the same length",
    Math.abs(sound.audioSeconds - 6) < 0.2,
    `sound runs ${sound.audioSeconds.toFixed(3)}s against about 6s of picture`,
  );

  console.log("\n  A full size source");
  const big = await page.evaluate(() => bigSourceExport());
  check(
    "the export is scaled down rather than re-encoded at full size",
    Math.max(big.width, big.height) <= 960,
    `came out ${big.width}x${big.height}, which is what made his phone judder`,
  );
  check(
    "...and comes out reel shaped even from a landscape camera",
    Math.abs(big.width / big.height - 9 / 16) < 0.02,
    `${big.width}x${big.height} is ${(big.width / big.height).toFixed(3)} wide to tall, not 0.563, ` +
      `so it cannot be posted without him cropping it himself`,
  );
  check(
    "a four second piece still takes about four seconds",
    big.wall < 9,
    `took ${big.wall}s, so it is falling behind real time`,
  );
  check(
    "the picture never holds still for long",
    big.longestHold < 0.25,
    `the longest the picture sits on one frame is ${big.longestHold}s, which is seen as a stutter`,
  );
  // A floor, not a standard. How many frames a second this manages
  // depends entirely on the machine: a shared cloud box with no graphics
  // hardware manages about fifteen on this clip, Aaron's phone managed
  // under nineteen on his. Asserting a number either could fail on a day
  // the box is busy, so this catches a slideshow and leaves the quality
  // question to the evenness check above, which is the one that decides
  // whether a video looks right.
  check(
    "it is a video rather than a slideshow",
    big.fps !== null && big.fps >= 10,
    `came out at ${big.fps} frames a second`,
  );

  const joined = await page.evaluate(() => runJoin());
  console.log("\n  Joining a 4 second piece and a 3 second piece into one");
  check(
    "the joined video is about 7 seconds",
    Math.abs(joined.measured - 7) < 0.5,
    `came out ${joined.measured.toFixed(2)}s`,
  );
  check(
    "it starts with the first piece",
    joined.early === "green",
    `the frame one second in reads ${joined.early}`,
  );
  check(
    "...and ends with the second one, so the join really happened",
    joined.late === "blue",
    `the frame near the end reads ${joined.late}; the second piece never arrived`,
  );
  check("the joined file is not empty", joined.bytes > 1000, `${joined.bytes} bytes`);
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
