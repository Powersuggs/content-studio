/**
 * Which way to cut, decided by what the device can do.
 *
 * There are two engines. export-codecs.ts decodes the frames and encodes
 * them again, which is several times faster than the video is long and
 * keeps every frame. export-video.ts plays the video and records the
 * screen, which works on anything and is slower than real time.
 *
 * The fast one needs WebCodecs with H.264, which Safari has fully from
 * iOS 26 and partly from 16.4. Rather than reading a version number, the
 * device is asked outright, once, and the answer decides. Nothing else in
 * the app needs to know which happened, except the one line that tells
 * him how long to wait.
 *
 * The asking is done here with the browser's own calls rather than with
 * the library that does the cutting, and the library is fetched only when
 * a cut is actually started. Bundled eagerly it added 155 kilobytes to
 * the filming screen, which is a lot to send to a phone that may be on
 * mobile data and may never press the button.
 */

import type { ExportProgress, ExportResult, Part } from "./export-video";

export type Route = "fast" | "playback" | "none";

export interface RouteChoice {
  route: Route;
  /** Said out loud when the fast way is not available, so it is not a mystery. */
  reason: string | null;
  /** Roughly how long a finished video of this length will take to make. */
  estimate: (seconds: number) => string;
}

const fastEstimate = (seconds: number) =>
  `about ${Math.max(2, Math.ceil(seconds / 4))} seconds`;
const slowEstimate = (seconds: number) => `about ${Math.ceil(seconds)} seconds`;

/**
 * H.264 profiles to try, most capable first.
 *
 * A device will usually take one of these and refuse the others, and
 * which one is not worth predicting. High for larger frames, then main,
 * then baseline, which almost anything with hardware encoding supports.
 */
const AVC_PROFILES = ["avc1.640028", "avc1.4d0028", "avc1.42001f"];

/** Round to an even number; some encoders refuse an odd width or height. */
function even(n: number): number {
  return Math.max(2, Math.round(n / 2) * 2);
}

/**
 * Whether the browser can encode H.264 and AAC with WebCodecs.
 *
 * Only these two matter. Anything that can write those can be wrapped up
 * as an MP4, which is the only thing Instagram takes. A browser that can
 * cut quickly but only into WebM is no use here, so it is treated as not
 * being able to: better the slower route that produces a postable file
 * than a quick one he finds out about at the upload screen.
 */
async function canCutFastNatively(
  width: number,
  height: number,
): Promise<{ ok: boolean; reason: string | null }> {
  if (
    typeof VideoEncoder === "undefined" ||
    typeof AudioEncoder === "undefined" ||
    typeof VideoDecoder === "undefined"
  ) {
    return {
      ok: false,
      reason:
        "This browser does not have the newer video engine, so cutting takes about as long as the video.",
    };
  }
  try {
    let video = false;
    for (const codec of AVC_PROFILES) {
      const answer = await VideoEncoder.isConfigSupported({
        codec,
        width: even(Math.min(width, 1920)),
        height: even(Math.min(height, 1920)),
      });
      if (answer.supported) {
        video = true;
        break;
      }
    }
    if (!video) {
      return {
        ok: false,
        reason:
          "This browser cannot write video quickly in the format Instagram takes, so cutting takes about as long as the video.",
      };
    }
    const audio = await AudioEncoder.isConfigSupported({
      codec: "mp4a.40.2",
      sampleRate: 48000,
      numberOfChannels: 1,
    });
    if (!audio.supported) {
      return {
        ok: false,
        reason:
          "This browser cannot write the sound quickly, so cutting takes about as long as the video.",
      };
    }
    return { ok: true, reason: null };
  } catch (err) {
    return {
      ok: false,
      reason:
        "This browser would not say whether it can cut quickly, so cutting takes about as long as the video. " +
        (err instanceof Error ? err.message : ""),
    };
  }
}

/**
 * Ask the device which route it can take.
 *
 * Falls back rather than failing: a browser with no WebCodecs still has
 * the playback route, and only a browser with neither gets "none".
 */
export async function chooseRoute(width = 1080, height = 1920): Promise<RouteChoice> {
  if (typeof window === "undefined") {
    return { route: "none", reason: null, estimate: slowEstimate };
  }
  const fast = await canCutFastNatively(width, height);
  if (fast.ok) return { route: "fast", reason: null, estimate: fastEstimate };

  const { canExport } = await import("./export-video");
  const slow = await canExport();
  if (slow.ok) {
    return { route: "playback", reason: fast.reason, estimate: slowEstimate };
  }
  return { route: "none", reason: slow.reason ?? fast.reason, estimate: slowEstimate };
}

/**
 * Cut and join, by whichever route this device can take.
 *
 * Both engines are fetched only at this point, so neither is sent to a
 * phone that is only reading a script.
 */
export async function cutPieces(
  parts: Part[],
  route: Route,
  options: {
    onProgress?: (p: ExportProgress) => void;
    signal?: AbortSignal;
  } = {},
): Promise<ExportResult> {
  if (route === "none") {
    throw new Error("This browser cannot make a video file at all.");
  }
  if (route === "fast") {
    const { cutFast } = await import("./export-codecs");
    return cutFast(parts, options);
  }
  const { exportSequence } = await import("./export-video");
  return exportSequence(parts, options);
}

export type { ExportProgress, ExportResult, Part };
