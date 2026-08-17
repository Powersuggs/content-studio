"use client";

import { useState, useTransition } from "react";
import { PenLine, ListPlus, Check } from "lucide-react";
import { queueScriptAction } from "@/app/scripts/actions";

interface ScriptResult {
  id: number;
  hook: string;
  script: string;
  caption: string;
  notes: string;
}

export default function ScriptWriterForm({
  initialModelPostId,
}: {
  initialModelPostId: number | null;
}) {
  const [topic, setTopic] = useState("");
  const [modelPostId] = useState<number | null>(initialModelPostId);
  const [result, setResult] = useState<ScriptResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);
  const [isPending, startTransition] = useTransition();

  function generate() {
    if (!topic.trim()) return;
    setError(null);
    setQueued(false);
    startTransition(async () => {
      const res = await fetch("/api/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, modelPostId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Script generation failed");
        return;
      }
      setResult(data);
    });
  }

  function saveToQueue() {
    if (!result) return;
    startTransition(async () => {
      await queueScriptAction(result.id);
      setQueued(true);
    });
  }

  return (
    <div className="space-y-6">
      {modelPostId && (
        <p className="text-xs text-muted">
          Modeling on{" "}
          <a href={`/posts/${modelPostId}`} className="text-accent underline">
            post #{modelPostId}
          </a>
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && generate()}
          placeholder="What's the video about?"
          className="flex-1 rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-text outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={generate}
          disabled={isPending || !topic.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg disabled:opacity-50"
        >
          <PenLine size={15} />
          {isPending ? "Writing…" : "Write script"}
        </button>
      </div>

      {error && <p className="text-sm text-warn">{error}</p>}

      {result && (
        <div className="space-y-4 rounded-xl border border-border bg-panel p-5">
          <div>
            <p className="text-xs uppercase tracking-wide text-faint">Hook</p>
            <p className="mt-1 text-base font-medium text-text">{result.hook}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-faint">Script</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-text">{result.script}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-faint">Caption</p>
            <p className="mt-1 text-sm text-text">{result.caption}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-faint">Notes</p>
            <p className="mt-1 text-sm text-muted">{result.notes}</p>
          </div>

          <button
            type="button"
            onClick={saveToQueue}
            disabled={isPending || queued}
            className="inline-flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-sm text-accent disabled:opacity-60"
          >
            {queued ? <Check size={14} /> : <ListPlus size={14} />}
            {queued ? "Queued for Session Mode" : "Save to queue"}
          </button>
        </div>
      )}
    </div>
  );
}
