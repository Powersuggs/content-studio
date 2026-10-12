"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, Loader2, AlertCircle } from "lucide-react";

type State = "idle" | "recording" | "transcribing" | "error";

/**
 * Record an answer and get text back.
 *
 * Browser support is the awkward part. getUserMedia needs HTTPS (fine on
 * Vercel, and localhost counts), and the audio format MediaRecorder produces
 * differs by browser: Chrome and Firefox give webm/opus, Safari gives mp4.
 * Groq accepts all of those, so we ask for the browser's own preference rather
 * than forcing a format Safari would refuse to produce.
 */
export default function VoiceRecorder({
  onTranscript,
  disabled,
}: {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}) {
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Release the microphone if the component goes away mid-recording,
  // otherwise the browser keeps showing the recording indicator.
  useEffect(() => {
    return () => {
      timerRef.current && clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function pickMimeType(): string | undefined {
    if (typeof MediaRecorder === "undefined") return undefined;
    for (const type of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return undefined;
  }

  async function start() {
    setError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setState("error");
      setError("This browser can't record audio. Type your answer instead.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => void send(mimeType);
      recorder.start();

      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
      setState("recording");
    } catch (err) {
      setState("error");
      const name = (err as { name?: string })?.name;
      if (name === "NotAllowedError") {
        setError("Microphone blocked. Allow it in your browser's address bar, then try again.");
      } else if (name === "NotFoundError") {
        setError("No microphone found. Type your answer instead.");
      } else {
        setError("Couldn't start recording. Type your answer instead.");
      }
    }
  }

  function stop() {
    timerRef.current && clearInterval(timerRef.current);
    recorderRef.current?.state === "recording" && recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setState("transcribing");
  }

  async function send(mimeType?: string) {
    try {
      const blob = new Blob(chunksRef.current, { type: mimeType ?? "audio/webm" });
      if (blob.size < 1000) {
        setState("error");
        setError("That was too short to hear. Hold the button and speak for a few seconds.");
        return;
      }

      const form = new FormData();
      form.append("audio", blob);
      const res = await fetch("/api/voice/transcribe", { method: "POST", body: form });
      const data = await res.json();

      if (!res.ok) {
        setState("error");
        setError(data?.error ?? "Transcription failed. Try again or type your answer.");
        return;
      }

      onTranscript(data.text as string);
      setState("idle");
    } catch {
      setState("error");
      setError("Couldn't reach the transcription service. Try again or type your answer.");
    }
  }

  const mins = Math.floor(seconds / 60);
  const secs = String(seconds % 60).padStart(2, "0");

  return (
    <div className="space-y-2">
      {state === "recording" ? (
        <button
          type="button"
          onClick={stop}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-warn bg-warn/10 px-3 py-2.5 text-sm font-medium text-warn"
        >
          <Square size={16} strokeWidth={2} />
          Stop recording
          <span className="ml-1 tabular-nums opacity-80">
            {mins}:{secs}
          </span>
        </button>
      ) : state === "transcribing" ? (
        <div className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-panel-2 px-3 py-2.5 text-sm text-muted">
          <Loader2 size={16} strokeWidth={2} className="animate-spin" />
          Writing that down...
        </div>
      ) : (
        <button
          type="button"
          onClick={start}
          disabled={disabled}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-panel-2 px-3 py-2.5 text-sm text-text transition-colors hover:border-accent disabled:opacity-50"
        >
          <Mic size={16} strokeWidth={2} />
          Answer out loud
        </button>
      )}

      {error && (
        <p className="flex items-start gap-1.5 text-xs text-warn">
          <AlertCircle size={14} strokeWidth={2} className="mt-px shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
