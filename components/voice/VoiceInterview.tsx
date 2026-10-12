"use client";

import { useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { VOICE_QUESTIONS } from "@/lib/voice/questions";
import { saveAnswerAction } from "@/app/voice/actions";
import VoiceRecorder from "./VoiceRecorder";

export default function VoiceInterview({
  initialAnswers,
}: {
  initialAnswers: Record<string, string>;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers);
  const [index, setIndex] = useState(() => {
    // Open on the first unanswered question rather than the beginning, so
    // coming back to finish does not mean clicking past what you already did.
    const firstUnanswered = VOICE_QUESTIONS.findIndex((q) => !initialAnswers[q.key]);
    return firstUnanswered === -1 ? 0 : firstUnanswered;
  });
  const [draft, setDraft] = useState("");
  const [source, setSource] = useState<"typed" | "spoken">("typed");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const question = VOICE_QUESTIONS[index];
  const answeredCount = useMemo(
    () => VOICE_QUESTIONS.filter((q) => answers[q.key]).length,
    [answers],
  );

  const current = draft || answers[question.key] || "";

  function goto(next: number) {
    setDraft("");
    setError(null);
    setSource("typed");
    setIndex(Math.max(0, Math.min(VOICE_QUESTIONS.length - 1, next)));
  }

  async function save(andAdvance: boolean) {
    const text = current.trim();
    if (!text) {
      setError("Say or write something first.");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await saveAnswerAction({
      questionKey: question.key,
      answerText: text,
      source,
    });
    setSaving(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setAnswers((prev) => ({ ...prev, [question.key]: text }));
    if (andAdvance && index < VOICE_QUESTIONS.length - 1) goto(index + 1);
    else setDraft("");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-8">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h1 className="text-lg font-semibold text-text">Your voice</h1>
          <span className="text-xs text-muted">
            {answeredCount} of {VOICE_QUESTIONS.length} answered
          </span>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-panel-2">
          <div
            className="h-full bg-accent transition-all duration-300"
            style={{ width: `${(answeredCount / VOICE_QUESTIONS.length) * 100}%` }}
          />
        </div>
        <p className="text-sm text-muted">
          Answer out loud where you can. How you say things is most of what makes this
          worth doing, and speaking carries that in a way typing flattens.
        </p>
      </div>

      <div className="space-y-4 rounded-xl border border-border bg-panel p-5">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">{question.section}</p>
          <h2 className="mt-1 text-base font-medium text-text">{question.question}</h2>
          <p className="mt-2 text-sm text-muted">{question.hint}</p>
        </div>

        <VoiceRecorder
          disabled={saving}
          onTranscript={(text) => {
            setDraft((prev) => (prev ? `${prev} ${text}` : text));
            setSource("spoken");
          }}
        />

        <textarea
          value={current}
          onChange={(e) => {
            setDraft(e.target.value);
            if (source === "spoken") setSource("typed");
          }}
          rows={7}
          placeholder="Or type it here."
          className="w-full resize-y rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-text outline-none focus:border-accent"
        />

        {error && <p className="text-xs text-warn">{error}</p>}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void save(true)}
            disabled={saving || !current.trim()}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg disabled:opacity-50"
          >
            {saving ? (
              <Loader2 size={15} strokeWidth={2} className="animate-spin" />
            ) : (
              <Check size={15} strokeWidth={2} />
            )}
            Save and next
          </button>
          <button
            type="button"
            onClick={() => goto(index + 1)}
            disabled={saving || index >= VOICE_QUESTIONS.length - 1}
            className="rounded-lg border border-border px-3 py-2 text-sm text-muted hover:text-text disabled:opacity-40"
          >
            Skip
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => goto(index - 1)}
          disabled={index === 0}
          className="flex items-center gap-1 text-sm text-muted hover:text-text disabled:opacity-40"
        >
          <ChevronLeft size={16} strokeWidth={2} />
          Previous
        </button>
        <span className="text-xs text-muted">
          Question {index + 1} of {VOICE_QUESTIONS.length}
        </span>
        <button
          type="button"
          onClick={() => goto(index + 1)}
          disabled={index >= VOICE_QUESTIONS.length - 1}
          className="flex items-center gap-1 text-sm text-muted hover:text-text disabled:opacity-40"
        >
          Next
          <ChevronRight size={16} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
