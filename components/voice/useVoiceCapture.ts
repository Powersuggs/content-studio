"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceState = "idle" | "recording" | "transcribing" | "error";

export interface VoiceCapture {
  state: VoiceState;
  error: string | null;
  seconds: number;
  /** The pre-correction transcript, when the correction pass changed something. */
  raw: string | null;
  supported: boolean;
  start: () => void;
  stop: () => void;
  clearError: () => void;
  clearRaw: () => void;
}

/**
 * Recording and transcription, with no opinion about how it looks.
 *
 * This was living inside the Your Voice recorder, which meant every other
 * box in the app stayed keyboard-only. The awkward parts are all here so
 * they exist once: getUserMedia needs HTTPS (localhost counts), the audio
 * format MediaRecorder produces differs by browser (Chrome and Firefox give
 * webm/opus, Safari gives mp4, Groq takes all three), and the microphone has
 * to be released or the browser keeps showing its recording indicator long
 * after the component is gone.
 */

/**
 * Stop on our own terms at eight minutes.
 *
 * Not an arbitrary tidiness limit. The transcript is posted through a
 * serverless function with a request body ceiling, and opus at this bitrate
 * reaches it somewhere past twenty minutes. Cutting at eight leaves a wide
 * margin and still covers any realistic spoken idea. Someone who hits it
 * gets their recording transcribed, not discarded.
 */
const MAX_SECONDS = 8 * 60;

export function useVoiceCapture(
  onTranscript: (text: string) => void,
): VoiceCapture {
  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [raw, setRaw] = useState<string | null>(null);
  // Computed after mount, never during render: navigator does not exist on
  // the server, and deciding this while rendering makes the server and the
  // client disagree about what to draw.
  const [supported, setSupported] = useState(true);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // The callback is read at send time rather than captured when recording
  // started, so a parent that re-renders mid-recording does not get a stale
  // one and silently drop the transcript.
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  useEffect(() => {
    setSupported(
      typeof navigator !== "undefined" &&
        !!navigator.mediaDevices?.getUserMedia &&
        typeof MediaRecorder !== "undefined",
    );
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const releaseMic = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const send = useCallback(async (mimeType?: string) => {
    try {
      const blob = new Blob(chunksRef.current, { type: mimeType ?? "audio/webm" });
      if (blob.size < 1000) {
        setState("error");
        setError("That was too short to hear. Press it again and speak for a few seconds.");
        return;
      }

      const form = new FormData();
      form.append("audio", blob);
      const res = await fetch("/api/voice/transcribe", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setState("error");
        setError(data?.error ?? "Could not write that down. Try again, or type it.");
        return;
      }

      const text = typeof data.text === "string" ? data.text.trim() : "";
      if (!text) {
        setState("error");
        setError("Nothing was heard in that. Try again, or type it.");
        return;
      }

      onTranscriptRef.current(text);
      setRaw(data.corrected ? (data.raw as string) : null);
      setState("idle");
    } catch {
      setState("error");
      setError("Could not reach the transcription service. Try again, or type it.");
    }
  }, []);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === "recording") {
      // onstop fires after this and is what sends the audio.
      recorderRef.current.stop();
      setState("transcribing");
    }
    releaseMic();
  }, [releaseMic]);

  // Held in a ref so the interval's tick can stop the recorder without the
  // interval being rebuilt every time `stop` changes identity.
  const stopRef = useRef(stop);
  stopRef.current = stop;

  const start = useCallback(async () => {
    setError(null);
    setRaw(null);

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setState("error");
      setError("This browser cannot record audio. Type it instead.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      let mimeType: string | undefined;
      for (const type of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]) {
        if (MediaRecorder.isTypeSupported(type)) {
          mimeType = type;
          break;
        }
      }

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => void send(mimeType);
      recorder.start();

      setSeconds(0);
      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= MAX_SECONDS) stopRef.current();
          return s + 1;
        });
      }, 1000);
      setState("recording");
    } catch (err) {
      setState("error");
      releaseMic();
      const name = (err as { name?: string })?.name;
      if (name === "NotAllowedError") {
        setError("Microphone blocked. Allow it in your browser's address bar, then try again.");
      } else if (name === "NotFoundError") {
        setError("No microphone found. Type it instead.");
      } else {
        setError("Could not start recording. Type it instead.");
      }
    }
  }, [send, releaseMic]);

  return {
    state,
    error,
    seconds,
    raw,
    supported,
    start: () => void start(),
    stop,
    clearError: () => {
      setError(null);
      setState("idle");
    },
    clearRaw: () => setRaw(null),
  };
}

/** Shared by every presentation, so a timer reads the same everywhere. */
export function formatElapsed(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export { MAX_SECONDS };
