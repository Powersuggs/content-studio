"use client";

import { useEffect, useRef } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import { useVoiceCapture, formatElapsed } from "./useVoiceCapture";

/**
 * Speak into any box.
 *
 * Sits next to a text field and adds what you said to whatever is already
 * in it. Appending rather than replacing is deliberate: someone who typed
 * half a thought and then started talking meant to continue, and silently
 * eating their typing is the kind of thing you only forgive once.
 *
 * The error, when there is one, is rendered by the parent through
 * `onError` rather than here, because this button is often inside a row
 * where there is no room for a sentence. Parents that do not care can
 * leave it out and the message is simply not shown.
 */
export default function MicButton({
  value,
  onChange,
  onError,
  disabled,
  label = "Speak",
  size = "md",
}: {
  value: string;
  onChange: (next: string) => void;
  onError?: (message: string | null) => void;
  disabled?: boolean;
  /** Shown beside the icon when there is room. */
  label?: string;
  size?: "sm" | "md";
}) {
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const voice = useVoiceCapture((text) => {
    const existing = value.trim();
    onChange(existing ? `${existing} ${text}` : text);
    onErrorRef.current?.(null);
  });

  // In an effect, not during render. Calling a parent's setState while
  // rendering is the classic "Cannot update a component while rendering a
  // different component" warning, and in a form it can loop.
  const { error } = voice;
  useEffect(() => {
    if (error) onErrorRef.current?.(error);
    // onError is held in a ref so a parent passing an inline arrow does not
    // re-run this on every keystroke.
  }, [error]);

  // A browser with no microphone API gets no button at all rather than one
  // that fails when pressed. The field beside it still works.
  if (!voice.supported) return null;

  const pad = size === "sm" ? "px-2 py-1.5 text-[11px]" : "px-2.5 py-2 text-xs";
  const icon = size === "sm" ? 13 : 15;

  if (voice.state === "recording") {
    return (
      <button
        type="button"
        onClick={voice.stop}
        title="Stop and write it down"
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-warn bg-warn/10 font-medium text-warn ${pad}`}
      >
        <Square size={icon} strokeWidth={2} />
        <span className="tabular-nums">{formatElapsed(voice.seconds)}</span>
      </button>
    );
  }

  if (voice.state === "transcribing") {
    return (
      <span
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-panel-2 text-muted ${pad}`}
      >
        <Loader2 size={icon} strokeWidth={2} className="animate-spin" />
        Writing
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        onErrorRef.current?.(null);
        voice.start();
      }}
      disabled={disabled}
      title="Say it out loud instead of typing"
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-panel-2 text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-50 ${pad}`}
    >
      <Mic size={icon} strokeWidth={2} />
      {label}
    </button>
  );
}
