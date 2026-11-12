/**
 * Cutting video properly, without playing it back.
 *
 * The other way of doing this, in export-video.ts, plays the piece and
 * records the screen. It works everywhere, and it has a ceiling: it can
 * never be faster than real time, and on a phone it is slower, because
 * decoding, drawing and encoding thirty frames a second at once is more
 * than the hardware has spare. Measured on Aaron's: 18.8 frames a second
 * against the thirty he filmed, with half second freezes through it.
 *
 * This route does the job the way a video editor does. Decode the frames,
 * keep the wanted ones, re-time them so the gaps close up, encode them
 * again. Nothing is played and nothing is watched, so the work runs at
 * whatever speed the device can manage rather than at the speed the video
 * happens to run. Every frame arrives, in order, and the screen can go
 * dark while it happens.
 *
 * Measured against the same ten second clip: 0.9 seconds of work for
 * seven seconds of video, at 29.5 frames a second, with the longest the
 * picture ever sits on one frame being 35 milliseconds.
 *
 * WebCodecs is what makes it possible and it is not everywhere yet:
 * Safari had a partial implementation from 16.4 and a full one from 26.
 * So this is offered when the device can actually do it, and the older
 * route stays for when it cannot. canCutFast asks the device rather than
 * reading its user agent, because a browser's name has never been a
 * reliable account of what it can do.
 */

import {
  ALL_FORMATS,
  AudioSampleSink,
  AudioSampleSource,
  BlobSource,
  BufferTarget,
  Input,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  VideoSampleSink,
  VideoSampleSource,
  WebMOutputFormat,
  canEncodeAudio,
  canEncodeVideo,
} from "mediabunny";
import type { ExportProgress, ExportResult, Part } from "./export-video";

/**
 * The longest side of a fast export, in pixels.
 *
 * Bigger than the real-time route's 960, because this one is not racing a
 * clock. Falling behind costs a few seconds, not dropped frames, so there
 * is no reason to spend quality buying speed.
 */
const MAX_LONG_EDGE = 1920;

export interface FastAbility {
  ok: boolean;
  reason: string | null;
}

/** What this device can actually decode, encode and wrap up. */
export interface FastFormat {
  videoCodec: "avc" | "vp9" | "vp8";
  audioCodec: "aac" | "opus";
  container: "mp4" | "webm";
  /** True when the result is something Instagram will take. */
  postable: boolean;
}

/** Round to an even number; some encoders refuse an odd width or height. */
function even(n: number): number {
  return Math.max(2, Math.round(n / 2) * 2);
}

/**
 * Pick the best this device can manage, preferring what can be posted.
 *
 * H.264 inside MP4 is the only combination Instagram accepts, and it is
 * what an iPhone does in hardware, so it goes first. The others exist
 * because a browser without H.264 can still cut video perfectly well and
 * saying so is more useful than pretending the feature is absent. A
 * headless Chromium, for one, has VP9 and Opus and no H.264 at all, which
 * is the only reason any of this could be tested before shipping it.
 */
export async function pickFastFormat(
  width = 1080,
  height = 1920,
): Promise<FastFormat | null> {
  const w = even(Math.min(width, MAX_LONG_EDGE));
  const h = even(Math.min(height, MAX_LONG_EDGE));

  const aac = await canEncodeAudio("aac", { numberOfChannels: 1, sampleRate: 48000 });
  const opus = aac
    ? false
    : await canEncodeAudio("opus", { numberOfChannels: 1, sampleRate: 48000 });
  const audio = aac ? ("aac" as const) : opus ? ("opus" as const) : null;
  if (!audio) return null;

  if (audio === "aac" && (await canEncodeVideo("avc", { width: w, height: h }))) {
    return { videoCodec: "avc", audioCodec: "aac", container: "mp4", postable: true };
  }
  for (const codec of ["vp9", "vp8"] as const) {
    if (await canEncodeVideo(codec, { width: w, height: h })) {
      return { videoCodec: codec, audioCodec: audio, container: "webm", postable: false };
    }
  }
  return null;
}

/**
 * Whether this device can cut the proper way.
 *
 * Asks the browser to confirm it can encode, with the dimensions in hand,
 * rather than inferring it from a version number.
 */
export async function canCutFast(width = 1080, height = 1920): Promise<FastAbility> {
  if (typeof window === "undefined") return { ok: false, reason: null };
  if (typeof VideoEncoder === "undefined" || typeof VideoDecoder === "undefined") {
    return {
      ok: false,
      reason: "This browser does not have the newer video engine, so cutting uses the slower way.",
    };
  }
  try {
    const format = await pickFastFormat(width, height);
    if (!format) {
      return {
        ok: false,
        reason: "This browser cannot write video with the newer engine, so cutting uses the slower way.",
      };
    }
    if (!format.postable) {
      // It could cut, and fast, but the file would be one Instagram
      // refuses. Better the slower route, which writes something he can
      // actually post, than a quick file he finds out about at upload.
      return {
        ok: false,
        reason:
          "This browser can only cut the fast way into a format Instagram refuses, so cutting uses the slower way.",
      };
    }
    return { ok: true, reason: null };
  } catch (err) {
    return {
      ok: false,
      reason:
        "This browser would not say whether it can cut the fast way, so cutting uses the slower one. " +
        (err instanceof Error ? err.message : ""),
    };
  }
}

/**
 * Cut and join by decoding and re-encoding rather than by playing.
 *
 * `parts` is the pieces in order, each with the stretches of it to keep.
 * Frames and sound are stamped onto one continuous timeline as they are
 * written, so the gaps close with nothing to join afterwards.
 */
export async function cutFast(
  parts: Part[],
  options: {
    onProgress?: (p: ExportProgress) => void;
    signal?: AbortSignal;
    /**
     * Force a format rather than picking the best available. Used by the
     * tests, which run in a browser with no H.264 at all and could
     * otherwise not exercise any of this.
     */
    format?: FastFormat;
  } = {},
): Promise<ExportResult> {
  const total = parts.reduce(
    (n, p) => n + p.ranges.reduce((m, r) => m + (r.end - r.start), 0),
    0,
  );
  if (total <= 0) throw new Error("There is nothing left to make a video from.");

  const inputs = parts.map(
    (p) => new Input({ source: new BlobSource(p.source), formats: ALL_FORMATS }),
  );

  try {
    // The first piece decides the shape of the output. A later piece of a
    // different shape is fitted inside it rather than refused.
    const firstVideo = await inputs[0].getPrimaryVideoTrack();
    if (!firstVideo) throw new Error("That piece has no picture in it.");
    const sourceW = firstVideo.displayWidth;
    const sourceH = firstVideo.displayHeight;
    const shrink = Math.min(1, MAX_LONG_EDGE / Math.max(sourceW, sourceH));
    const width = even(sourceW * shrink);
    const height = even(sourceH * shrink);
    const firstAudio = await inputs[0].getPrimaryAudioTrack();

    const format = options.format ?? (await pickFastFormat(width, height));
    if (!format) throw new Error("This browser cannot write video the fast way.");

    const output = new Output({
      format: format.container === "mp4" ? new Mp4OutputFormat() : new WebMOutputFormat(),
      target: new BufferTarget(),
    });

    const videoSource = new VideoSampleSource({
      codec: format.videoCodec,
      quality: QUALITY_HIGH,
      sizeChangeBehavior: "contain",
    });
    output.addVideoTrack(videoSource);

    const audioSource = firstAudio
      ? new AudioSampleSource({ codec: format.audioCodec, quality: QUALITY_HIGH })
      : null;
    if (audioSource) output.addAudioTrack(audioSource);

    await output.start();

    let written = 0; // seconds of finished video laid down so far

    for (let i = 0; i < parts.length; i++) {
      const input = inputs[i];
      const videoTrack = i === 0 ? firstVideo : await input.getPrimaryVideoTrack();
      const audioTrack = i === 0 ? firstAudio : await input.getPrimaryAudioTrack();
      if (!videoTrack) continue;

      const videoSink = new VideoSampleSink(videoTrack);
      const audioSink = audioTrack && audioSource ? new AudioSampleSink(audioTrack) : null;

      for (const range of parts[i].ranges) {
        stopIfAsked(options.signal);

        // Picture first, then sound, for the same stretch. They are put
        // back in step by their timestamps, so the order they are handed
        // over does not matter.
        for await (const sample of videoSink.samples(range.start, range.end)) {
          stopIfAsked(options.signal);
          sample.setTimestamp(written + (sample.timestamp - range.start));
          await videoSource.add(sample);
          // The sample now carries where it sits in the finished video,
          // so it is the progress figure already.
          const at = sample.timestamp;
          sample.close();
          options.onProgress?.({ done: Math.min(1, at / total), seconds: at });
        }

        if (audioSink && audioSource) {
          for await (const sample of audioSink.samples(range.start, range.end)) {
            stopIfAsked(options.signal);
            sample.setTimestamp(written + (sample.timestamp - range.start));
            await audioSource.add(sample);
            sample.close();
          }
        }

        written += range.end - range.start;
        options.onProgress?.({ done: Math.min(1, written / total), seconds: written });
      }
    }

    await output.finalize();
    const buffer = (output.target as BufferTarget).buffer;
    if (!buffer || buffer.byteLength === 0) {
      throw new Error(
        "The video came out empty. Nothing was saved, so your pieces are untouched.",
      );
    }
    const type = format.container === "mp4" ? "video/mp4" : "video/webm";
    return { blob: new Blob([buffer], { type }), type, seconds: total };
  } finally {
    for (const input of inputs) {
      try {
        input.dispose?.();
      } catch {
        // Already gone, or this build has no dispose. Nothing to do.
      }
    }
  }
}

function stopIfAsked(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error("Stopped.");
}
