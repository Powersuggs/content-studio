"use client";

import { useState, useTransition } from "react";
import { Sparkles, Loader2, Plus, X, Check } from "lucide-react";
import { createIdeaAction } from "@/app/ideas/actions";

interface Suggestion {
  title: string;
  note: string;
  because: string;
}

/**
 * Ideas proposed from his own best posts.
 *
 * Nothing is saved until he presses Keep. A batch that lands straight in
 * the list would mean sorting someone else's ideas out of his own every
 * time he opens the page, and the point of this screen is the list of
 * things HE wants to make.
 *
 * Each suggestion shows what it was learned from. A suggestion you cannot
 * argue with is one you cannot trust: seeing "this came from the
 * firefighter post, which people sent on" is what lets him say no, that
 * is not the lesson, and ignore it.
 */
export default function SuggestIdeas() {
  const [items, setItems] = useState<Suggestion[] | null>(null);
  const [kept, setKept] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function suggest() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/idea-suggestions", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Could not suggest ideas.");
        return;
      }
      setItems(data.ideas ?? []);
      setKept(new Set());
    } catch {
      setError("Could not reach the suggester. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function keep(i: number, s: Suggestion) {
    startTransition(async () => {
      await createIdeaAction({ title: s.title, note: s.note, source: "suggested" });
      setKept((prev) => new Set(prev).add(i));
    });
  }

  function drop(i: number) {
    setItems((prev) => (prev ? prev.filter((_, n) => n !== i) : prev));
    setKept((prev) => {
      // Indexes shift when one is removed, so the kept set is rebuilt
      // rather than patched. Getting this wrong marks the wrong card.
      const next = new Set<number>();
      for (const n of prev) next.add(n > i ? n - 1 : n);
      next.delete(i);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={suggest}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
        >
          {busy ? (
            <Loader2 size={14} strokeWidth={2} className="animate-spin" />
          ) : (
            <Sparkles size={14} strokeWidth={2} />
          )}
          {busy ? "Reading your posts" : "Suggest ideas from my best posts"}
        </button>
        {items && items.length > 0 && (
          <span className="text-xs text-faint">
            Keep the ones you want. Nothing is saved until you do.
          </span>
        )}
      </div>

      {error && <p className="text-xs text-warn">{error}</p>}

      {items && items.length === 0 && (
        <p className="text-xs text-faint">Nothing left in this batch.</p>
      )}

      {items && items.length > 0 && (
        <ul className="space-y-2">
          {items.map((s, i) => (
            <li
              key={`${i}-${s.title.slice(0, 20)}`}
              className="rounded-xl border border-border bg-panel p-3"
            >
              <p className="text-sm text-text">{s.title}</p>
              {s.note && <p className="mt-1 text-xs text-muted">{s.note}</p>}
              {s.because && (
                <p className="mt-1 text-[11px] text-faint">Learned from: {s.because}</p>
              )}
              <div className="mt-2 flex items-center gap-2">
                {kept.has(i) ? (
                  <span className="inline-flex items-center gap-1 text-xs text-accent">
                    <Check size={12} strokeWidth={2.5} /> On your list
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => keep(i, s)}
                    disabled={isPending}
                    className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-[11px] text-accent disabled:opacity-50"
                  >
                    <Plus size={11} strokeWidth={2.5} /> Keep
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => drop(i)}
                  className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] text-faint hover:border-warn hover:text-warn"
                >
                  <X size={11} strokeWidth={2.5} /> Not this one
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
