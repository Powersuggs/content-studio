"use client";

import { useState } from "react";
import { Mic, Square, Loader2, AlertCircle } from "lucide-react";
import { useVoiceCapture, formatElapsed } from "./useVoiceCapture";

/**
 * Record an answer and get text back.
 *
 * The full-width version, for the voice interview where recording IS the
 * task. The recording and transcription themselves now live in
 * useVoiceCapture, shared with the small inline button used next to the
 * ordinary text boxes elsewhere in the app, so there is one place where
 * microphone handling can be got wrong.
 *
 * Unlike the inline button this REPLACES rather than appends, because an
 * interview answer is a single take and re-recording means "that one, not
 * the last one".
 */
export default function VoiceRecorder({
  onTranscript,
  disabled,
}: {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}) {
  const [showRaw, setShowRaw] = useState(false);
  const voice = useVoiceCapture((text) => {
    setShowRaw(false);
    onTranscript(text);
  });

  return (
    <div className="space-y-2">
      {voice.state === "recording" ? (
        <button
          type="button"
          onClick={voice.stop}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-warn bg-warn/10 px-3 py-2.5 text-sm font-medium text-warn"
        >
          <Square size={16} strokeWidth={2} />
          Stop recording
          <span className="ml-1 tabular-nums opacity-80">
            {formatElapsed(voice.seconds)}
          </span>
        </button>
      ) : voice.state === "transcribing" ? (
        <div className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-panel-2 px-3 py-2.5 text-sm text-muted">
          <Loader2 size={16} strokeWidth={2} className="animate-spin" />
          Writing that down...
        </div>
      ) : (
        <button
          type="button"
          onClick={voice.start}
          disabled={disabled || !voice.supported}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-panel-2 px-3 py-2.5 text-sm text-text transition-colors hover:border-accent disabled:opacity-50"
        >
          <Mic size={16} strokeWidth={2} />
          {voice.supported ? "Answer out loud" : "Recording not available here"}
        </button>
      )}

      {voice.error && (
        <p className="flex items-start gap-1.5 text-xs text-warn">
          <AlertCircle size={14} strokeWidth={2} className="mt-px shrink-0" />
          {voice.error}
        </p>
      )}

      {voice.raw && (
        <div className="text-xs text-muted">
          <button
            type="button"
            onClick={() => setShowRaw((v) => !v)}
            className="underline underline-offset-2 hover:text-text"
          >
            {showRaw ? "Hide" : "Industry terms were corrected. See what was heard"}
          </button>
          {showRaw && (
            <p className="mt-1 rounded-lg border border-border bg-panel-2 px-3 py-2 leading-relaxed">
              {voice.raw}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
