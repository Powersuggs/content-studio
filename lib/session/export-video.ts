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

/**
 * Play the take, skipping the cuts, and record what comes out.
 *
 * `ranges` is what to KEEP, in order, as built by keepRanges.
 */
export async function exportCut(
  source: Blob,
  ranges: Span[],
  options: {
    onProgress?: (p: ExportProgress) => void;
    signal?: AbortSignal;
  } = {},
): Promise<ExportResult> {
  if (ranges.length === 0) {
    throw new Error("There is nothing left after those cuts.");
  }
  const type = pickExportType();
  if (!type) throw new Error("This browser cannot write a video file.");

  const total = ranges.reduce((n, r) => n + (r.end - r.start), 0);
  const url = URL.createObjectURL(source);
  const video = document.createElement("video");
  video.src = url;
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
    URL.revokeObjectURL(url);
    context?.close().catch(() => undefined);
  };

  try {
    await once(video, "loadedmetadata");

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1080;
    canvas.height = video.videoHeight || 1920;
    const paint = canvas.getContext("2d");
    if (!paint) throw new Error("This browser cannot draw video frames.");

    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) throw new Error("This browser has no audio support for editing.");
    context = new Ctor();
    // Safari starts audio contexts suspended until something user-driven
    // wakes them. The export is started by a button press, so this is
    // allowed here, and without it the finished video has no sound.
    if (context.state === "suspended") await context.resume().catch(() => undefined);

    const tap = context.createMediaElementSource(video);
    const sink = context.createMediaStreamDestination();
    tap.connect(sink);

    const mixed = new MediaStream([
      ...canvas.captureStream(30).getVideoTracks(),
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

    video.currentTime = ranges[0].start;
    await once(video, "seeked");
    recorder.start();
    await video.play();

    const draw = () => {
      paint.drawImage(video, 0, 0, canvas.width, canvas.height);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        reject(new Error("Stopped."));
      };
      options.signal?.addEventListener("abort", abort, { once: true });

      const tick = async () => {
        if (options.signal?.aborted) return;
        const range = ranges[index];
        if (!range) return resolve();

        if (video.currentTime >= range.end - 0.01 || video.ended) {
          produced += Math.max(0, Math.min(video.currentTime, range.end) - range.start);
          index += 1;
          const next = ranges[index];
          if (!next) {
            resolve();
            return;
          }
          // Pause the recorder across the jump so the skipped part is
          // never written, then carry on. The same trick the live silence
          // cutting uses, which is why the joins need no encoder.
          recorder?.pause();
          video.pause();
          video.currentTime = next.start;
          await once(video, "seeked").catch(() => undefined);
          await video.play().catch(() => undefined);
          recorder?.resume();
        }

        options.onProgress?.({
          done: total > 0 ? Math.min(1, (produced + Math.max(0, video.currentTime - (ranges[index]?.start ?? 0))) / total) : 0,
          seconds: produced,
        });
        setTimeout(tick, 60);
      };
      void tick();
    });

    cancelAnimationFrame(raf);
    recorder.stop();
    await finished;

    const blob = new Blob(chunks, { type });
    if (blob.size === 0) {
      throw new Error(
        "The edited video came out empty. Nothing was saved, so your original piece is untouched.",
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
