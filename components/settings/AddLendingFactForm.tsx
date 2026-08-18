"use client";

import { useState, useTransition } from "react";
import { BookmarkPlus, Check } from "lucide-react";
import { addLendingFactAction } from "@/app/settings/actions";

export default function AddLendingFactForm() {
  const [fact, setFact] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const canSubmit = fact.trim().length > 0;

  function save() {
    if (!canSubmit) return;
    startTransition(async () => {
      await addLendingFactAction({
        fact: fact.trim(),
        source_name: sourceName.trim(),
        source_url: sourceUrl.trim(),
      });
      setFact("");
      setSourceName("");
      setSourceUrl("");
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  }

  return (
    <div className="rounded-xl border border-border bg-panel p-5">
      <p className="text-sm font-medium text-text">Add a verified fact</p>
      <p className="mt-0.5 text-xs text-muted">
        Paste one specific rule you&rsquo;ve confirmed is correct -- a cap, a percentage, a program
        requirement -- along with where it came from. Every AI writing tool in the app will treat
        this as ground truth instead of guessing.
      </p>

      <div className="mt-4 space-y-3">
        <div>
          <label className="text-xs text-faint">Fact</label>
          <textarea
            value={fact}
            onChange={(e) => setFact(e.target.value)}
            rows={3}
            placeholder='e.g. "On VA loans, seller-paid closing costs don&rsquo;t count toward the 4% seller concession cap, but the 4% cap itself still applies to other seller-paid items."'
            className="mt-1 w-full resize-none rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-text outline-none focus:border-accent"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs text-faint">Source name</label>
            <input
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
              placeholder="e.g. VA Lenders Handbook, UWM, your compliance team"
              className="mt-1 w-full rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-text outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="text-xs text-faint">Source link (optional)</label>
            <input
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://..."
              className="mt-1 w-full rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-text outline-none focus:border-accent"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={save}
          disabled={isPending || !canSubmit}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg disabled:opacity-50"
        >
          {saved ? <Check size={14} /> : <BookmarkPlus size={14} />}
          {saved ? "Saved" : "Save fact"}
        </button>
      </div>
    </div>
  );
}
