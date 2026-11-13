"use client";

import { useState } from "react";
import Link from "next/link";
import { Mic, Square, Loader2, AlertCircle, Check, ArrowRight } from "lucide-react";
import { useVoiceCapture, formatElapsed } from "@/components/voice/useVoiceCapture";
import { FORMATS, type FormatId } from "@/lib/ideas/formats";
import { MIN_TRANSCRIPT_CHARS } from "@/lib/talk/prompt";

/**
 * Talk for a minute, get finished pieces.
 *
 * The app could already catch a one-line idea by voice and could already
 * write a format from an idea. What it could not do is the thing he
 * actually wanted: say the whole thought out loud, in his own words, and
 * have the pieces written from THOSE words rather than from a summary of
 * them.
 *
 * So the transcript stays visible and editable at every step. It is the
 * source, he is the only one who knows if it came out right, and a
 * recording he cannot see before it is used is a recording he cannot
 * trust.
 *
 * Formats are written one at a time, in sequence, and each shows its own
 * state. Firing all of them at once would be faster and would also mean
 * one failure looking identical to five.
 */

type Stage = "talking" | "review" | "filing" | "writing" | "done";

interface FormatState {
  id: FormatId;
  state: "waiting" | "writing" | "written" | "failed";
  error?: string;
}

/** What most takes become, so the common case needs no decisions. */
const DEFAULT_FORMATS: FormatId[] = ["reel", "carousel"];

export default function TalkItOut() {
  const [stage, setStage] = useState<Stage>("talking");
  const [transcript, setTranscript] = useState("");
  const [chosen, setChosen] = useState<FormatId[]>(DEFAULT_FORMATS);
  const [progress, setProgress] = useState<FormatState[]>([]);
  const [ideaId, setIdeaId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Appends rather than replaces, so he can stop, think, and carry on
  // without losing the first half of what he said.
  const voice = useVoiceCapture((text) => {
    setTranscript((prev) => (prev ? `${prev.trim()} ${text.trim()}` : text.trim()));
    setStage("review");
  });

  const longEnough = transcript.trim().length >= MIN_TRANSCRIPT_CHARS;

  function toggleFormat(id: FormatId) {
    setChosen((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id],
    );
  }

  async function run() {
    setError(null);
    setStage("filing");

    let id: number;
    try {
      const res = await fetch("/api/talk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transcript: transcript.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Could not save that take.");
      id = Number(data.ideaId);
      setIdeaId(id);
      setTitle(String(data.title ?? ""));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that take.");
      setStage("review");
      return;
    }

    // Saved. From here a failure costs a format, never the recording, so
    // the stage moves on even if every write fails.
    setStage("writing");
    const queue: FormatState[] = chosen.map((f) => ({ id: f, state: "waiting" }));
    setProgress(queue);

    for (let i = 0; i < queue.length; i++) {
      setProgress((p) => p.map((f, n) => (n === i ? { ...f, state: "writing" } : f)));
      try {
        const res = await fetch("/api/idea-output", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ideaId: id, format: queue[i].id }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error ?? "That one did not come back.");
        setProgress((p) => p.map((f, n) => (n === i ? { ...f, state: "written" } : f)));
      } catch (e) {
        const message = e instanceof Error ? e.message : "That one did not come back.";
        setProgress((p) =>
          p.map((f, n) => (n === i ? { ...f, state: "failed", error: message } : f)),
        );
      }
    }
    setStage("done");
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-text">Talk it out</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Say the whole thought out loud. Everything gets written from your
          words, not from a one-line version of them.
        </p>
      </div>

      {/* Recording. Stays available after the first take so he can add to it. */}
      <div className="space-y-2 rounded-xl border border-border bg-panel p-3">
        {voice.state === "recording" ? (
          <button
            type="button"
            onClick={voice.stop}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-warn bg-warn/10 text-sm font-medium text-warn"
          >
            <Square size={16} />
            Stop
            <span className="ml-1 tabular-nums opacity-80">
              {formatElapsed(voice.seconds)}
            </span>
          </button>
        ) : voice.state === "transcribing" ? (
          <div className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-border bg-panel-2 text-sm text-muted">
            <Loader2 size={16} className="animate-spin" />
            Writing that down...
          </div>
        ) : (
          <button
            type="button"
            onClick={voice.start}
            disabled={!voice.supported || stage === "filing" || stage === "writing"}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-accent text-sm font-medium text-bg disabled:opacity-40"
          >
            <Mic size={16} />
            {!voice.supported
              ? "Recording not available here"
              : transcript
                ? "Say more"
                : "Start talking"}
          </button>
        )}
        {voice.error && (
          <p className="flex items-start gap-1.5 text-xs text-warn">
            <AlertCircle size={13} className="mt-0.5 shrink-0" />
            {voice.error}
          </p>
        )}
      </div>

      {/*
        Always shown, never only after a recording. Three reasons, all of
        them real: a phone that refuses the microphone would otherwise
        leave him with no way in at all; a transcript he already has
        somewhere else can be pasted; and seeing the empty box is what
        tells him his words are going to land somewhere he can check them,
        before he commits to talking for two minutes.
      */}
      <>
          <div className="space-y-2 rounded-xl border border-border bg-panel p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-faint">
                {transcript ? "What you said. Fix anything it misheard." : "Or type it"}
              </p>
              <span className="text-xs tabular-nums text-faint">
                {transcript.trim().split(/\s+/).filter(Boolean).length} words
              </span>
            </div>
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              rows={10}
              disabled={stage === "filing" || stage === "writing"}
              placeholder="Your words land here"
              className="w-full resize-y rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm leading-relaxed text-text outline-none focus:border-accent disabled:opacity-60"
            />
            {!longEnough && transcript.trim() && (
              <p className="text-xs text-faint">
                A bit more and this is enough to write from.
              </p>
            )}
          </div>

          <div className="space-y-2 rounded-xl border border-border bg-panel p-3">
            <p className="text-xs text-faint">Write it as</p>
            <div className="flex flex-wrap gap-1.5">
              {FORMATS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  disabled={stage === "filing" || stage === "writing"}
                  onClick={() => toggleFormat(f.id)}
                  title={f.hint}
                  className={`h-10 rounded-lg border px-3 text-xs disabled:opacity-40 ${
                    chosen.includes(f.id)
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border text-muted"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
      </>

      {error && (
        <p className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
          {error}
        </p>
      )}

      {stage !== "done" && (
        <button
          type="button"
          disabled={
            !longEnough ||
            chosen.length === 0 ||
            stage === "filing" ||
            stage === "writing" ||
            voice.state === "recording"
          }
          onClick={run}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-accent text-sm font-medium text-bg disabled:opacity-40"
        >
          {stage === "filing" || stage === "writing" ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              {stage === "filing" ? "Saving the take..." : "Writing..."}
            </>
          ) : (
            <>
              Write {chosen.length === 1 ? "it" : `all ${chosen.length}`}
              <ArrowRight size={16} />
            </>
          )}
        </button>
      )}

      {progress.length > 0 && (
        <ul className="space-y-1.5 rounded-xl border border-border bg-panel p-3">
          {progress.map((f) => (
            <li key={f.id} className="flex items-start gap-2 text-sm">
              <span className="mt-0.5 shrink-0">
                {f.state === "written" ? (
                  <Check size={15} className="text-accent" />
                ) : f.state === "writing" ? (
                  <Loader2 size={15} className="animate-spin text-muted" />
                ) : f.state === "failed" ? (
                  <AlertCircle size={15} className="text-warn" />
                ) : (
                  <span className="block h-[15px] w-[15px] rounded-full border border-border" />
                )}
              </span>
              <span className="min-w-0">
                <span className="text-text">
                  {FORMATS.find((x) => x.id === f.id)?.label ?? f.id}
                </span>
                {f.state === "failed" && (
                  <span className="block text-xs text-warn">{f.error}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {stage === "done" && ideaId && (
        <div className="space-y-3 rounded-xl border border-accent/40 bg-accent/5 p-3">
          <p className="text-sm text-text">{title || "Saved."}</p>
          <Link
            href="/ideas"
            className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-accent px-4 text-sm font-medium text-bg"
          >
            Read what it wrote
            <ArrowRight size={15} />
          </Link>
          <button
            type="button"
            onClick={() => {
              setStage("talking");
              setTranscript("");
              setProgress([]);
              setIdeaId(null);
              setTitle("");
              setChosen(DEFAULT_FORMATS);
            }}
            className="ml-2 inline-flex h-11 items-center rounded-lg border border-border px-4 text-sm text-muted"
          >
            Another one
          </button>
        </div>
      )}
    </div>
  );
}
