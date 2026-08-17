"use client";

import { useState, useTransition } from "react";
import { Zap, Copy, Check } from "lucide-react";

interface HookItem {
  archetype: string;
  hook: string;
  rationale: string;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="shrink-0 rounded-md p-1.5 text-faint hover:bg-panel-2 hover:text-text"
      aria-label="Copy hook"
    >
      {copied ? <Check size={14} className="text-accent" /> : <Copy size={14} />}
    </button>
  );
}

export default function HookLabForm() {
  const [topic, setTopic] = useState("");
  const [hooks, setHooks] = useState<HookItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function generate() {
    if (!topic.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/hooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Hook generation failed");
        return;
      }
      setHooks(data.hooks);
    });
  }

  return (
    <div className="space-y-6">
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
          <Zap size={15} />
          {isPending ? "Generating…" : "Generate 8 hooks"}
        </button>
      </div>

      {error && <p className="text-sm text-warn">{error}</p>}

      {hooks && (
        <div className="grid gap-3 sm:grid-cols-2">
          {hooks.map((h) => (
            <div key={h.archetype} className="rounded-lg border border-border bg-panel p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-idea">
                {h.archetype}
              </p>
              <div className="mt-1.5 flex items-start justify-between gap-2">
                <p className="text-sm text-text">{h.hook}</p>
                <CopyButton text={h.hook} />
              </div>
              <p className="mt-2 text-xs text-faint">{h.rationale}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
