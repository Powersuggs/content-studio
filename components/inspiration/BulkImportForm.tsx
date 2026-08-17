"use client";

import { useState } from "react";
import { Layers, ChevronDown, ChevronUp, Loader2, Check, X } from "lucide-react";
import {
  saveReferencePostAction,
  type ReferenceBreakdown,
} from "@/app/inspiration/actions";

const SEPARATOR_HINT =
  "Paste several posts' captions at once. Separate each one with a blank line, or a line with just ---.";

interface ItemResult {
  preview: string;
  status: "pending" | "analyzing" | "saving" | "done" | "error";
  error?: string;
}

function splitEntries(raw: string): string[] {
  return raw
    .split(/\n\s*-{3,}\s*\n|\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const MAX_ITEMS = 20;

export default function BulkImportForm() {
  const [expanded, setExpanded] = useState(false);
  const [handle, setHandle] = useState("");
  const [raw, setRaw] = useState("");
  const [items, setItems] = useState<ItemResult[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = splitEntries(raw);
  const overflow = preview.length - MAX_ITEMS;

  async function runImport() {
    setError(null);
    const handleTrim = handle.trim();
    if (!handleTrim) {
      setError("Enter the creator's handle first -- it applies to every post in this batch.");
      return;
    }
    const entries = splitEntries(raw).slice(0, MAX_ITEMS);
    if (entries.length === 0) {
      setError("Paste at least one post's caption below.");
      return;
    }

    setRunning(true);
    const initial: ItemResult[] = entries.map((e) => ({
      preview: e.length > 80 ? `${e.slice(0, 80)}…` : e,
      status: "pending",
    }));
    setItems(initial);

    for (let i = 0; i < entries.length; i++) {
      setItems((prev) =>
        prev.map((it, idx) => (idx === i ? { ...it, status: "analyzing" } : it)),
      );
      let breakdown: ReferenceBreakdown | null = null;
      try {
        const res = await fetch("/api/reverse-engineer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ handle: handleTrim, caption: entries[i] }),
        });
        const data = await res.json();
        if (res.ok) {
          breakdown = data;
        }
        // If analysis fails for one post, still save the post itself below
        // rather than losing the whole entry -- a missing breakdown isn't
        // worth discarding a post over.
      } catch {
        // Same reasoning: network hiccup on analysis shouldn't drop the post.
      }

      setItems((prev) =>
        prev.map((it, idx) => (idx === i ? { ...it, status: "saving" } : it)),
      );
      try {
        await saveReferencePostAction({
          handle: handleTrim,
          url: null,
          caption: entries[i],
          breakdown,
        });
        setItems((prev) =>
          prev.map((it, idx) => (idx === i ? { ...it, status: "done" } : it)),
        );
      } catch (err) {
        setItems((prev) =>
          prev.map((it, idx) =>
            idx === i
              ? {
                  ...it,
                  status: "error",
                  error: err instanceof Error ? err.message : "Save failed",
                }
              : it,
          ),
        );
      }
    }

    setRunning(false);
  }

  return (
    <div className="rounded-xl border border-border bg-panel p-5">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          <p className="text-sm font-medium text-text">Bulk import multiple posts</p>
          <p className="mt-0.5 text-xs text-muted">{SEPARATOR_HINT}</p>
        </div>
        {expanded ? <ChevronUp size={16} className="text-faint" /> : <ChevronDown size={16} className="text-faint" />}
      </button>

      {expanded && (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-faint">
            Note: Instagram doesn&apos;t let this app pull another creator&apos;s posts
            automatically -- there&apos;s no API for that here. This is the practical
            version: paste a batch of captions you&apos;ve copied from their profile, and
            every one gets reverse-engineered and saved in one go instead of one at a time.
          </p>

          <div>
            <label className="text-xs text-faint">Creator handle (applies to the whole batch)</label>
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="theirhandle"
              className="mt-1 w-full rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-text outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="text-xs text-faint">Captions (separated by a blank line or ---)</label>
            <textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              rows={8}
              placeholder={"First post's caption...\n\n---\n\nSecond post's caption..."}
              className="mt-1 w-full resize-y rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-text outline-none focus:border-accent"
            />
            <p className="mt-1 text-[11px] text-faint">
              {preview.length} post{preview.length === 1 ? "" : "s"} detected
              {overflow > 0 ? ` -- only the first ${MAX_ITEMS} will be imported, ${overflow} will be skipped this run` : ""}
            </p>
          </div>

          {error && <p className="text-sm text-warn">{error}</p>}

          <button
            type="button"
            onClick={runImport}
            disabled={running || preview.length === 0}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg disabled:opacity-50"
          >
            <Layers size={15} />
            {running ? "Importing…" : "Import & analyze all"}
          </button>

          {items.length > 0 && (
            <ul className="space-y-1.5 rounded-lg border border-border bg-panel-2 p-3">
              {items.map((it, i) => (
                <li key={i} className="flex items-start gap-2 text-xs">
                  <span className="mt-0.5 shrink-0">
                    {it.status === "done" && <Check size={13} className="text-accent" />}
                    {it.status === "error" && <X size={13} className="text-warn" />}
                    {(it.status === "analyzing" || it.status === "saving") && (
                      <Loader2 size={13} className="animate-spin text-muted" />
                    )}
                    {it.status === "pending" && <span className="block h-[13px] w-[13px]" />}
                  </span>
                  <span className="text-muted">
                    {it.preview}
                    {it.status === "analyzing" && " -- analyzing…"}
                    {it.status === "saving" && " -- saving…"}
                    {it.status === "error" && ` -- ${it.error}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
