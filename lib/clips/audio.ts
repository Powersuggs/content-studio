/**
 * Getting the sound out of a video, in the browser.
 *
 * The transcriber has a 25 MB limit. That holds about an hour and a half
 * of speech and about forty seconds of phone video, so sending the file
 * as filmed is not an option: the picture is almost all of the bytes and
 * none of the information, since whisper cannot see.
 *
 * So the browser decodes the audio, mixes it to one channel, resamples
 * it to 16 kHz, and writes a WAV. 16 kHz mono is what speech recognition
 * works at internally, so nothing is lost by going there first, and it
 * is 32 KB a second, which means the limit becomes about thirteen
 * minutes of recording rather than forty seconds.
 *
 * WAV rather than something compressed because compressing in a browser
 * means either an encoder that only runs in real time, which would take
 * a minute to prepare a minute of video, or a dependency for one. 32 KB
 * a second is small enough that neither is worth it.
 */

/** 16 kHz mono, which is what the recogniser resamples to anyway. */
export const TARGET_RATE = 16000;

/** The transcriber's own ceiling, which the WAV has to fit under. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** How long a recording fits, given the rate and the ceiling. */
export const MAX_SECONDS = Math.floor(
  (MAX_UPLOAD_BYTES - 44) / (TARGET_RATE * 2),
);

export interface ExtractResult {
  audio: Blob;
  seconds: number;
}

export async function extractAudio(file: Blob): Promise<ExtractResult> {
  const bytes = await file.arrayBuffer();

  // A plain AudioContext is used to decode and an OfflineAudioContext to
  // resample. Decoding needs the file's own rate; resampling needs the
  // target rate, and one context cannot do both.
  const Ctx: typeof AudioContext =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) throw new Error("This browser cannot read audio out of a video.");

  const probe = new Ctx();
  let decoded: AudioBuffer;
  try {
    decoded = await probe.decodeAudioData(bytes.slice(0));
  } catch {
    throw new Error(
      "Could not read any sound in that file. If it is a video, check it was recorded with audio.",
    );
  } finally {
    // Not awaited: closing is housekeeping and a browser that refuses
    // must not fail the extraction.
    probe.close().catch(() => {});
  }

  if (decoded.duration > MAX_SECONDS) {
    throw new Error(
      `That is ${Math.round(decoded.duration / 60)} minutes. The limit is ${Math.floor(
        MAX_SECONDS / 60,
      )}. Cut it down first, or send a piece of it.`,
    );
  }

  const frames = Math.max(1, Math.ceil(decoded.duration * TARGET_RATE));
  const offline = new OfflineAudioContext(1, frames, TARGET_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const mono = await offline.startRendering();

  return {
    audio: new Blob([encodeWav(mono.getChannelData(0), TARGET_RATE)], {
      type: "audio/wav",
    }),
    seconds: decoded.duration,
  };
}

/**
 * Float samples to a 16-bit WAV.
 *
 * Pure, and exported, so the header can be asserted in a test without a
 * browser. A wrong header is the kind of bug that produces "the
 * transcriber refused that recording" with nothing to go on.
 */
export function encodeWav(samples: Float32Array, rate: number): ArrayBuffer {
  const bytes = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(bytes);

  const ascii = (at: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(at + i, text.charCodeAt(i));
  };

  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true); // size of this chunk
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // one channel
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true); // bytes per second
  view.setUint16(32, 2, true); // bytes per frame
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, "data");
  view.setUint32(40, samples.length * 2, true);

  for (let i = 0; i < samples.length; i++) {
    // Clamped before scaling. A sample slightly over 1, which happens
    // after mixing, would otherwise wrap to a large negative number and
    // put a click in the audio at exactly that moment.
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return bytes;
}
