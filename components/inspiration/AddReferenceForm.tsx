"use client";

import { useState, useTransition } from "react";
import { Sparkles, BookmarkPlus, Check, ChevronDown, ChevronUp } from "lucide-react";
import {
  saveReferencePostAction,
  type ReferenceBreakdown,
} from "@/app/inspiration/actions";

export default function AddReferenceForm() {
  const [handle, setHandle] = useState("");
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [transcript, setTranscript] = useState("");
  const [expanded, setExpanded] = useState(false);

  const [breakdown, setBreakdown] = useState<ReferenceBreakdown | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isPending, startTransition] = useTransition();

  const canSubmit = handle.trim().length > 0;

  function reset() {
    setHandle("");
    setUrl("");
    setCaption("");
    setTranscript("");
    setBreakdown(null);
    setError(null);
    setSaved(false);
    setExpanded(false);
  }

  async function analyze() {
    if (!canSubmit) return;
    setError(null);
    setSaved(false);
    if (!caption.trim() && !transcript.trim()) {
      setError("Paste at least the caption or a transcript so there's something to analyze.");
      return;
    }
    setIsAnalyzing(true);
    try {
      const res = await fetch("/api/reverse-engineer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle, url, caption, transcript }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Analysis failed");
        return;
      }
      setBreakdown(data);
    } finally {
      setIsAnalyzing(false);
    }
  }

  function save() {
    if (!canSubmit) return;
    startTransition(async () => {
      await saveReferencePostAction({
        handle,
        url: url.trim() || null,
        caption: caption.trim() || null,
        breakdown,
      });
      setSaved(true);
      setTimeout(reset, 1200);
    });
  }

  const busy = isAnalyzing || isPending;

  return (
    <div className="rounded-xl border border-border bg-panel p-5">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          <p className="text-sm font-medium text-text">Add a reference post</p>
          <p className="mt-0.5 text-xs text-muted">
            Paste a link and whatever you've got -- caption, transcript, or both -- and reverse-engineer it.
          </p>
        </div>
        {expanded ? <ChevronUp size={16} className="text-faint" /> : <ChevronDown size={16} className="text-faint" />}
      </button>

      {expanded && (
        <div className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs text-faint">Creator handle</label>
              <input
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="theirhandle"
                className="mt-1 w-full rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-text outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="text-xs text-faint">Link (optional)</label>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://instagram.com/reel/..."
                className="mt-1 w-full rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-text outline-none focus:border-accent"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-faint">Caption</label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={2}
              placeholder="Paste the caption text"
              className="mt-1 w-full resize-none rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-text outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="text-xs text-faint">Transcript (optional, but the breakdown is much sharper with one)</label>
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              rows={4}
              placeholder="Paste the spoken words -- e.g. from the platform's own transcript/captions panel"
              className="mt-1 w-full resize-none rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-text outline-none focus:border-accent"
            />
          </div>

          {error && <p className="text-sm text-warn">{error}</p>}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={analyze}
              disabled={busy || !canSubmit}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg disabled:opacity-50"
            >
              <Sparkles size={15} />
              {isAnalyzing ? "Reverse-engineering…" : "Reverse-engineer & analyze"}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy || !canSubmit || saved}
              className="inline-flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-4 py-2 text-sm text-accent disabled:opacity-60"
            >
              {saved ? <Check size={14} /> : <BookmarkPlus size={14} />}
              {saved ? "Saved" : breakdown ? "Save with breakdown" : "Save without analyzing"}
            </button>
          </div>

          {breakdown && (
            <div className="space-y-3 rounded-lg border border-border bg-panel-2 p-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-faint">
                  Hook &middot; {breakdown.hook_type}
                </p>
                <p className="mt-1 text-sm font-medium text-text">&ldquo;{breakdown.hook}&rdquo;</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-faint">Skeleton</p>
                <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-sm text-text">
                  {breakdown.skeleton.map((beat, i) => (
                    <li key={i}>{beat}</li>
                  ))}
                </ol>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-faint">Pacing</p>
                <p className="mt-1 text-sm text-text">{breakdown.pacing_notes}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-faint">Caption pattern</p>
                <p className="mt-1 text-sm text-text">{breakdown.caption_pattern}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-faint">Why it works</p>
                <p className="mt-1 text-sm text-muted">{breakdown.why_it_works}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-faint">Reusable template</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-text">{breakdown.reusable_template}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
