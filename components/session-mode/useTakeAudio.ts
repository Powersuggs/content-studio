"use client";

import { useEffect, useState } from "react";
import {
  findQuietSpans,
  loudnessProfile,
  QUIET_DEFAULTS,
  type Loudness,
  type QuietOptions,
  type Span,
} from "@/lib/session/recut";

/** How many loudness readings per second of video the waveform holds. */
export const SLICES_PER_SECOND = 50;

export interface TakeAudio {
  loudness: Loudness;
  /** The real duration, read from the decoded audio. */
  seconds: number;
  /** The gaps found with the current settings. */
  quiet: Span[];
  loading: boolean;
  /** Said plainly when the sound cannot be read, rather than a flat line. */
  error: string | null;
}

/**
 * Read a take's sound so it can be drawn and cut.
 *
 * Decodes the whole file in one go. That is fine for the length of thing
 * being filmed here, a minute or two, and far simpler than streaming it.
 *
 * Worth knowing: decodeAudioData wants a format the browser can decode,
 * and the file came from that same browser's recorder, so in practice it
 * can. When it cannot, that is said out loud. A waveform that quietly
 * renders as a flat line would look like a silent take and invite him to
 * cut the whole thing.
 */
export function useTakeAudio(
  file: Blob | null,
  options: QuietOptions = QUIET_DEFAULTS,
): TakeAudio {
  const [state, setState] = useState<Omit<TakeAudio, "quiet">>({
    loudness: [],
    seconds: 0,
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (!file) {
      setState({ loudness: [], seconds: 0, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState({ loudness: [], seconds: 0, loading: true, error: null });

    (async () => {
      let context: AudioContext | null = null;
      try {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!Ctor) throw new Error("This browser cannot read sound from a video.");
        context = new Ctor();
        const bytes = await file.arrayBuffer();
        const audio = await context.decodeAudioData(bytes);
        if (cancelled) return;

        // Mix the channels down. A take filmed on a phone is usually one
        // channel anyway, but a laptop can give two and only reading the
        // left one would miss anything panned away from it.
        const length = audio.length;
        const mixed = new Float32Array(length);
        for (let c = 0; c < audio.numberOfChannels; c++) {
          const data = audio.getChannelData(c);
          for (let i = 0; i < length; i++) mixed[i] += data[i] / audio.numberOfChannels;
        }

        setState({
          loudness: loudnessProfile(mixed, audio.sampleRate, SLICES_PER_SECOND),
          seconds: audio.duration,
          loading: false,
          error: null,
        });
      } catch (err) {
        if (cancelled) return;
        setState({
          loudness: [],
          seconds: 0,
          loading: false,
          error:
            "The sound in this piece could not be read, so the quiet parts cannot be found. " +
            "You can still trim the ends and save it. " +
            (err instanceof Error ? err.message : ""),
        });
      } finally {
        await context?.close().catch(() => undefined);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [file]);

  const quiet =
    state.loudness.length > 0
      ? findQuietSpans(state.loudness, SLICES_PER_SECOND, options)
      : [];

  return { ...state, quiet };
}
