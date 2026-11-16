"use client";

import { useState } from "react";
import { Sparkles, Loader2, AlertTriangle } from "lucide-react";
import { JOB_LABEL, type TitleIdea } from "@/lib/books/titles";

/**
 * Six titles to choose between.
 *
 * Used in two places, which is why it is its own component: on the Start a
 * book form, where he has an idea and no name for it yet, and on the book
 * itself, where he has lived with a name for a week and gone off it.
 *
 * Each suggestion shows the title and the subtitle as two separate lines,
 * because that is what they are, and picking one fills both fields rather
 * than pasting "Title: Subtitle" into the title box.
 *
 * The one line under each is there so he can disagree with the reasoning
 * and not just the words. A set of six titles with no reasoning is a set
 * he has to re-judge from scratch every time he looks at it.
 */
export default function TitleSuggestions({
  bookId,
  premise,
  audience,
  currentTitle,
  onPick,
}: {
  bookId?: number;
  premise: string;
  audience?: string;
  currentTitle?: string;
  onPick: (pick: { title: string; subtitle: string }) => void;
}) {
  const [ideas, setIdeas] = useState<TitleIdea[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function suggest() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/book-titles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId, premise, audience, title: currentTitle }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not suggest titles.");
      setIdeas(Array.isArray(data.ideas) ? data.ideas : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not suggest titles.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={suggest}
        disabled={busy || !premise.trim()}
        className="inline-flex h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm text-text disabled:opacity-40"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
        {ideas ? "Suggest six more" : "Suggest titles"}
      </button>

      {!premise.trim() && (
        <p className="text-xs text-faint">
          Say what the book argues first. That is what the titles get written from.
        </p>
      )}

      {error && <p className="text-xs text-warn">{error}</p>}

      {ideas && ideas.length === 0 && (
        <p className="text-xs text-faint">Nothing usable came back. Press it again.</p>
      )}

      {ideas && ideas.length > 0 && (
        <ul className="space-y-2">
          {ideas.map((idea, i) => (
            <li
              key={`${idea.title}-${i}`}
              className="rounded-lg border border-border bg-panel-2 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text">{idea.title}</p>
                  <p className="mt-0.5 text-sm text-muted">{idea.subtitle}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onPick({ title: idea.title, subtitle: idea.subtitle })}
                  className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs text-text"
                >
                  Use this
                </button>
              </div>

              <p className="mt-2 text-xs text-faint">
                <span className="text-muted">{JOB_LABEL[idea.job]}.</span>{" "}
                {idea.why}
              </p>

              {idea.risky && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-warn">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                  <span>
                    This subtitle {idea.risky}. You are licensed, so that is a
                    compliance problem and not a style choice. Use it only if you
                    are sure, or pick another.
                  </span>
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
