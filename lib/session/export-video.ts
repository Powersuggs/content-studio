/**
 * Making the cut video.
 *
 * There is no video encoder in this app. ffmpeg compiled to WebAssembly is
 * the usual answer and six attempts at loading it in this project have all
 * failed at the same place, so this takes the other route: play the take
 * back, paint each frame onto a canvas, record the canvas and the audio
 * together, and skip over the parts being cut.
 *
 * What that costs, said plainly because Aaron chose this knowing both:
 *   - it runs in real time, so a ninety second video takes ninety seconds
 *   - the result is encoded a second time, so it loses a little quality,
 *     the way a copy of a copy does
 *
 * What it buys is that it works with what the browser already has.
 *
 * The seams are made the same way Session Mode cuts silence while filming:
 * pause the recorder, move, resume. A paused MediaRecorder writes nothing,
 * so the jump never reaches the file and no re-encoding is needed to join
 * the pieces.
 *
 * Every API used here is supported in Safari on iPhone on paper: canvas
 * capture since iOS 11, MediaRecorder since 14.5. What is NOT documented
 * anywhere is the combination, a canvas video track recorded alongside a
 * Web Audio track, so canExport() below tries it rather than trusting it.
 */

import type { Span } from "./recut";

/**
 * A canvas track asked for frames by hand rather than on a timer.
 * requestFrame is not in TypeScript's DOM library.
 */
interface CanvasTrack extends MediaStreamTrack {
  requestFrame?: () => void;
}

/**
 * The longest side of an exported video, in pixels.
 *
 * Smaller than the source on purpose. Aaron's first real export came back
 * at 1920 by 1080 and averaged twenty one frames a second with seven half
 * second freezes in it, because painting and encoding two million pixels
 * in real time, while playing the video back at the same time, is more
 * than a phone has spare. 1280 is under half the pixels, and the
 * difference survives Instagram's own re-encoding anyway.
 */
const MAX_LONG_EDGE = 1280;

/** Width over height of a reel: 1080 by 1920. */
const REEL_SHAPE = 9 / 16;
import { sourceTimeAt } from "./recut";

export interface ExportProgress {
  /** 0 to 1 through the finished video. */
  done: number;
  /** Seconds of finished video produced so far. */
  seconds: number;
}

export interface ExportResult {
  blob: Blob;
  type: string;
  seconds: number;
}

/**
 * Formats to try, best first.
 *
 * MP4 ahead of WebM for the same reason the recorder prefers it:
 * Instagram refuses WebM outright, so a WebM export would be a file he
 * cannot post. Whatever the browser accepts here, it must also be able to
 * record, which isTypeSupported answers for both.
 */
const CANDIDATE_TYPES = [
  "video/mp4;codecs=avc1,mp4a.40.2",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

export function pickExportType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const type of CANDIDATE_TYPES) {
    try {
      if (MediaRecorder.isTypeSupported(type)) return type;
    } catch {
      // Some browsers throw rather than answering false.
    }
  }
  return null;
}

/**
 * Whether this device can actually do it.
 *
 * Built as the real thing, briefly: a canvas track and a Web Audio track
 * recorded together, exactly as the export does it. An earlier bug in this
 * project came from probing with a stand-in instead of the real article,
 * so the save button reported itself working and then did nothing. Not
 * repeating that.
 */
export async function canExport(): Promise<{ ok: boolean; reason: string | null }> {
  if (typeof document === "undefined") return { ok: false, reason: null };

  const type = pickExportType();
  if (!type) {
    return {
      ok: false,
      reason: "This browser cannot write a video file. Safari on iPhone or Chrome can.",
    };
  }

  let context: AudioContext | null = null;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const paint = canvas.getContext("2d");
    if (!paint) return { ok: false, reason: "This browser cannot draw video frames." };
    paint.fillRect(0, 0, 64, 64);

    if (typeof canvas.captureStream !== "function") {
      return {
        ok: false,
        reason: "This browser cannot record from a canvas, which is how the cut video is made.",
      };
    }
    const video = canvas.captureStream(30);

    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return { ok: false, reason: "This browser has no audio support for editing." };
    context = new Ctor();
    const sink = context.createMediaStreamDestination();

    const mixed = new MediaStream([
      ...video.getVideoTracks(),
      ...sink.stream.getAudioTracks(),
    ]);
    // Constructing the recorder is the step that actually refuses when a
    // browser will not take this combination.
    const probe = new MediaRecorder(mixed, { mimeType: type });
    probe.stop();
    video.getTracks().forEach((t) => t.stop());
    return { ok: true, reason: null };
  } catch (err) {
    return {
      ok: false,
      reason:
        "This browser will not record an edited video. " +
        (err instanceof Error ? err.message : "It refused without saying why."),
    };
  } finally {
    await context?.close().catch(() => undefined);
  }
}

/** One filmed piece, and which stretches of it to keep. */
export interface Part {
  source: Blob;
  /** Stretches to KEEP, in order, as built by keepRanges. */
  ranges: Span[];
}

/**
 * Play the take, skipping the cuts, and record what comes out.
 *
 * `ranges` is what to KEEP, in order, as built by keepRanges.
 */
export function exportCut(
  source: Blob,
  ranges: Span[],
  options: ExportOptions = {},
): Promise<ExportResult> {
  return exportSequence([{ source, ranges }], options);
}

export interface ExportOptions {
  onProgress?: (p: ExportProgress) => void;
  signal?: AbortSignal;
}

/**
 * Play several pieces, in order, skipping the cuts, into one video.
 *
 * The same machinery as cutting one piece, which is the point: he films
 * in pieces, so he ends up with separate files and has to leave the app
 * to put them together. Moving from the end of one piece to the start of
 * the next is the same move as jumping over a silence, so joining costs
 * almost nothing once the cutting works.
 *
 * Pieces may be different shapes. The canvas is sized from the first one
 * and the rest are fitted inside it rather than stretched, because a
 * piece filmed in landscape squeezed into a tall frame looks broken in a
 * way that is hard to undo after the fact.
 */
export async function exportSequence(
  parts: Part[],
  options: ExportOptions = {},
): Promise<ExportResult> {
  // Flatten to a straight list of stretches to play, each remembering
  // which piece it came from, so the loop below has one kind of step.
  const steps = parts.flatMap((part, piece) =>
    part.ranges.map((r) => ({ piece, start: r.start, end: r.end })),
  );
  if (steps.length === 0) {
    throw new Error("There is nothing left to make a video from.");
  }
  const type = pickExportType();
  if (!type) throw new Error("This browser cannot write a video file.");

  const total = steps.reduce((n, s) => n + (s.end - s.start), 0);
  const urls = parts.map((p) => URL.createObjectURL(p.source));
  const video = document.createElement("video");
  video.muted = false;
  video.playsInline = true;
  // Keeps the frames coming when the phone is not showing this element.
  video.setAttribute("playsinline", "");

  let context: AudioContext | null = null;
  let recorder: MediaRecorder | null = null;
  let raf = 0;

  const cleanup = () => {
    cancelAnimationFrame(raf);
    video.pause();
    urls.forEach((u) => URL.revokeObjectURL(u));
    context?.close().catch(() => undefined);
  };

  // Long enough to kill the click, short enough that nobody hears it go.
  const FADE_SECONDS = 0.012;

  try {
    let loaded = -1;
    const load = async (piece: number) => {
      if (loaded === piece) return;
      video.src = urls[piece];
      await once(video, "loadedmetadata");
      loaded = piece;
    };
    await load(steps[0].piece);

    /*
     * Smaller than the source on purpose.
     *
     * Aaron's first real export came back at 1920 by 1080 and averaged
     * twenty one frames a second with seven half second freezes in it,
     * because painting and encoding two million pixels thirty times a
     * second in real time is more than a phone has spare. Two thirds of
     * the width is under half the pixels, and the difference between that
     * and the source survives Instagram's own re-encoding anyway.
     */
    /*
     * Always reel shaped.
     *
     * Aaron's first real export came out 1920 by 1080, because the camera
     * would not give a tall frame and the wide one was kept, which is the
     * designed fallback. A landscape file cannot be posted as a reel
     * without him cropping it himself afterwards, and the dashed guide he
     * frames against while filming already promises a 9:16 middle. So
     * that promise is kept here: the export is the guide.
     *
     * A piece already 9:16 loses nothing. A phone sensor at 3:4 loses the
     * sides, which is what the guide showed. A landscape take loses a
     * lot, which is the price of it having been filmed wide.
     */
    const sourceW = video.videoWidth || 1080;
    const sourceH = video.videoHeight || 1920;
    const outH = Math.min(MAX_LONG_EDGE, sourceH);
    const canvas = document.createElement("canvas");
    // Even numbers: some encoders refuse an odd width or height.
    canvas.height = Math.max(2, Math.round(outH / 2) * 2);
    canvas.width = Math.max(2, Math.round((outH * REEL_SHAPE) / 2) * 2);
    // alpha false lets the browser skip compositing work it cannot use.
    const paint = canvas.getContext("2d", { alpha: false });
    if (!paint) throw new Error("This browser cannot draw video frames.");

    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) throw new Error("This browser has no audio support for editing.");
    context = new Ctor();
    // Safari starts audio contexts suspended until something user-driven
    // wakes them. The export is started by a button press, so this is
    // allowed here, and without it the finished video has no sound.
    if (context.state === "suspended") await context.resume().catch(() => undefined);

    // Bound to the element, not to the file, so it survives swapping the
    // source from one piece to the next.
    const tap = context.createMediaElementSource(video);
    // A fader between the video and the recording, so every cut can be
    // eased in and out over a few milliseconds. Chopping a waveform at an
    // arbitrary sample leaves a step, and a step is a click. Measured on
    // a test export before this existed: the largest jump between two
    // neighbouring samples in the whole file sat exactly on the cut.
    const fader = context.createGain();
    const sink = context.createMediaStreamDestination();
    tap.connect(fader);
    fader.connect(sink);

    /** Ease the sound down or up, and wait for it to finish. */
    const fade = async (to: number) => {
      const now = context!.currentTime;
      fader.gain.cancelScheduledValues(now);
      fader.gain.setValueAtTime(fader.gain.value, now);
      fader.gain.linearRampToValueAtTime(to, now + FADE_SECONDS);
      await new Promise((r) => setTimeout(r, FADE_SECONDS * 1000 + 5));
    };

    /*
     * One canvas frame per video frame, rather than a timer sampling the
     * video thirty times a second.
     *
     * Aaron: "after the edits it doesnt smoth it out it glitches the
     * video". A free running sampler and the video's own frame rate do
     * not line up, so some frames get captured twice and others not at
     * all, which is judder. It is worst on a phone, where re-encoding at
     * full size in real time leaves little headroom and dropped frames
     * come out as stutter.
     *
     * requestVideoFrameCallback fires once per decoded frame, so the
     * recording gets exactly the frames the source has, in order. Where
     * it is missing, fall back to the old timer rather than refusing.
     */
    const framesExact =
      typeof video.requestVideoFrameCallback === "function";
    const captured = canvas.captureStream(framesExact ? 0 : 30);
    const videoTrack = captured.getVideoTracks()[0] as CanvasTrack;

    const mixed = new MediaStream([
      ...captured.getVideoTracks(),
      ...sink.stream.getAudioTracks(),
    ]);

    const chunks: BlobPart[] = [];
    recorder = new MediaRecorder(mixed, { mimeType: type });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    const finished = once(recorder, "stop");

    let index = 0;
    let produced = 0; // seconds of finished video written so far

    video.currentTime = steps[0].start;
    await once(video, "seeked");
    recorder.start();
    await video.play();

    const paintFrame = () => {
      // Filled, not fitted. The frame is cropped to the middle rather
      // than letterboxed, because the output shape is now fixed at a
      // reel and bars down the sides of a reel are worse than a crop.
      const scale = Math.max(
        canvas.width / (video.videoWidth || canvas.width),
        canvas.height / (video.videoHeight || canvas.height),
      );
      const w = (video.videoWidth || canvas.width) * scale;
      const h = (video.videoHeight || canvas.height) * scale;
      paint.fillStyle = "#000";
      paint.fillRect(0, 0, canvas.width, canvas.height);
      paint.drawImage(video, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    };

    let frameHandle = 0;
    let lastFrameAt = Date.now();
    let framesPushed = 0;
    let longestGapMs = 0;
    const pushFrame = () => {
      paintFrame();
      // Hand this exact frame to the recording. Without it a manual
      // capture stream records nothing at all.
      videoTrack.requestFrame?.();
      const now = Date.now();
      if (recorder?.state === "recording") {
        longestGapMs = Math.max(longestGapMs, now - lastFrameAt);
      }
      lastFrameAt = now;
      framesPushed += 1;
    };
    const pump = () => {
      pushFrame();
      frameHandle = video.requestVideoFrameCallback(pump);
    };

    /*
     * A second way to keep frames coming.
     *
     * requestVideoFrameCallback stops firing when the page stops being
     * visible, which is what the screen dimming or switching apps does.
     * The sound carries on, because audio is not throttled, so what comes
     * out is a video whose picture stops partway through and whose sound
     * runs to the end. That is exactly what Aaron's first real export
     * did: thirty seconds of him talking over thirteen seconds of
     * picture, frozen on the last frame for the rest.
     *
     * This timer pushes a frame whenever none has arrived for a while.
     * Timers are throttled in the background too, so it is not a cure,
     * but a slow picture beats no picture, and the check after recording
     * refuses to hand over a file where it went badly wrong.
     */
    const keepAlive = setInterval(() => {
      if (recorder?.state === "recording" && Date.now() - lastFrameAt > 250) {
        pushFrame();
      }
    }, 200);
    if (framesExact) {
      frameHandle = video.requestVideoFrameCallback(pump);
    } else {
      const loop = () => {
        pushFrame();
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }

    // Ask the screen to stay on. Without this a phone dims and locks
    // partway through a long export and takes the picture with it.
    let wakeLock: WakeLockSentinel | null = null;
    try {
      wakeLock = (await navigator.wakeLock?.request("screen")) ?? null;
    } catch {
      // Refused or unsupported. The checks below still catch the damage.
    }
    let wentAway = false;
    const watchVisibility = () => {
      if (document.visibilityState === "hidden") wentAway = true;
    };
    document.addEventListener("visibilitychange", watchVisibility);

    /** Wait until a real frame from the new position has been drawn. */
    const nextFrame = () =>
      new Promise<void>((resolve) => {
        if (framesExact) {
          video.requestVideoFrameCallback(() => resolve());
        } else {
          setTimeout(resolve, 80);
        }
      });

    await new Promise<void>((resolve, reject) => {
      const abort = () => reject(new Error("Stopped."));
      options.signal?.addEventListener("abort", abort, { once: true });

      const tick = async () => {
        if (options.signal?.aborted) return;
        const step = steps[index];
        if (!step) return resolve();

        if (video.currentTime >= step.end - 0.01 || video.ended) {
          produced += Math.max(0, Math.min(video.currentTime, step.end) - step.start);
          index += 1;
          const next = steps[index];
          if (!next) {
            resolve();
            return;
          }
          // Pause the recorder across the move so neither the skipped
          // stretch nor the gap between two pieces is ever written. The
          // same trick the live silence cutting uses, which is why the
          // joins need no encoder.
          //
          // Order matters all the way through. Ease the sound out BEFORE
          // pausing, so the fade is recorded and the cut is not a step.
          // Then, on the far side, wait for a real frame from the new
          // position to be drawn before letting the recorder run again,
          // or the first thing written is whatever the canvas was still
          // holding from before the jump.
          await fade(0);
          recorder?.pause();
          video.pause();
          await load(next.piece);
          video.currentTime = next.start;
          await once(video, "seeked").catch(() => undefined);
          await video.play().catch(() => undefined);
          await nextFrame();
          recorder?.resume();
          await fade(1);
        }

        options.onProgress?.({
          done: total > 0
            ? Math.min(1, (produced + Math.max(0, video.currentTime - (steps[index]?.start ?? 0))) / total)
            : 0,
          seconds: produced,
        });
        setTimeout(tick, 60);
      };
      void tick();
    });

    cancelAnimationFrame(raf);
    clearInterval(keepAlive);
    document.removeEventListener("visibilitychange", watchVisibility);
    if (framesExact && frameHandle) {
      video.cancelVideoFrameCallback(frameHandle);
    }
    await wakeLock?.release().catch(() => undefined);
    // Ease out at the end too, so the last thing in the file is not a
    // waveform stopping mid swing.
    await fade(0);
    recorder.stop();
    await finished;

    const blob = new Blob(chunks, { type });
    if (blob.size === 0) {
      throw new Error(
        "The video came out empty. Nothing was saved, so your original pieces are untouched.",
      );
    }

    /*
     * Refuse a file whose picture stopped.
     *
     * Judged on the longest stretch with no frame at all rather than on
     * the frame count, because the two failures look identical in a total
     * and are not at all alike to watch. A video running slowly is poor.
     * A video whose picture froze two thirds of the way through, over a
     * soundtrack that carries on talking, is not a video. That is what
     * Aaron's first real export was, and it was handed to him as though
     * it had worked, which is the worst thing this could do: it looks
     * finished until you watch it.
     *
     * The frame count is kept as a second line, for a machine so far
     * behind that what comes out is a slideshow.
     */
    const STALL_MS = 2000;
    const SLIDESHOW_FPS = 6;
    if (longestGapMs > STALL_MS || framesPushed < total * SLIDESHOW_FPS) {
      const stopped = longestGapMs > STALL_MS;
      throw new Error(
        [
          stopped
            ? `The picture stopped for ${(longestGapMs / 1000).toFixed(1)} seconds partway through,`
            : "The picture came out too jerky to use,",
          wentAway
            ? "because this page stopped being on screen. Keep it open and the screen awake while it works."
            : "because this device could not keep up with making the video while playing it back. A shorter piece, or this one cut in two, should manage it.",
          "Nothing was saved, so your pieces are untouched.",
        ].join(" "),
      );
    }

    return { blob, type, seconds: total };
  } finally {
    cleanup();
  }
}

/** Resolve on the next event of this name. */
function once(target: EventTarget, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ok = () => {
      target.removeEventListener("error", bad);
      resolve();
    };
    const bad = () => {
      target.removeEventListener(name, ok);
      reject(new Error(`${name} never happened`));
    };
    target.addEventListener(name, ok, { once: true });
    target.addEventListener("error", bad, { once: true });
  });
}

/** Re-exported so callers do not need both modules for one calculation. */
export { sourceTimeAt };
