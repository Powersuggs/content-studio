"use client";

import { useState, useTransition } from "react";
import { Newspaper, Loader2, AlertTriangle, Copy, Check, Lightbulb } from "lucide-react";
import MicButton from "@/components/voice/MicButton";
import { createIdeaAction } from "@/app/ideas/actions";
import type { NewsOutput } from "@/lib/news/prompt";

/**
 * Reacting to something that happened.
 *
 * The warning about figures sits ABOVE the draft, not under it. It is
 * about a licensed lender publishing a number he has not checked, and a
 * warning below a piece of finished writing is a warning read after the
 * decision to post it has already been made.
 */
export default function NewsReaction() {
  const [headline, setHeadline] = useState("");
  const [detail, setDetail] = useState("");
  const [source, setSource] = useState("");
  const [url, setUrl] = useState("");
  const [draft, setDraft] = useState<NewsOutput | null>(null);
  const [unsourced, setUnsourced] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [kept, setKept] = useState(false);
  const [pending, start] = useTransition();

  async function write() {
    setError(null);
    setDraft(null);
    setUnsourced([]);
    setKept(false);
    setBusy(true);
    try {
      const res = await fetch("/api/news", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ headline, detail, source, url }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Could not write that.");
      setDraft(data.draft ?? null);
      setUnsourced(Array.isArray(data.unsourced) ? data.unsourced : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not write that.");
    } finally {
      setBusy(false);
    }
  }

  const whole = draft
    ? [draft.hook, draft.body, draft.caption].filter(Boolean).join("\n\n")
    : "";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-text">React to the news</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Say what happened and paste whatever you have of the article. Any
          number from the article is only ever repeated as something that
          source said, never as yours.
        </p>
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-panel p-3">
        <div className="flex items-start gap-2">
          <input
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            placeholder="What happened"
            className="min-w-0 flex-1 rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-text outline-none focus:border-accent"
          />
          <MicButton value={headline} onChange={setHeadline} onError={setError} label="" size="sm" />
        </div>
        <div className="flex items-start gap-2">
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            rows={6}
            placeholder="Paste the article, or the part of it that matters. Leave this empty and nothing with a number in it gets written."
            className="min-w-0 flex-1 resize-y rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-text outline-none focus:border-accent"
          />
          <MicButton value={detail} onChange={setDetail} onError={setError} label="" size="sm" />
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="Who reported it"
            className="min-w-0 flex-1 rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-text outline-none focus:border-accent"
          />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Link, if you have it"
            className="min-w-0 flex-1 rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-text outline-none focus:border-accent"
          />
        </div>
        {detail.trim() && !source.trim() && (
          <p className="text-xs text-faint">
            Without a source named, no figure from that text will be repeated.
            Attribution has to name someone.
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={write}
        disabled={busy || headline.trim().length < 8}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-accent text-sm font-medium text-bg disabled:opacity-40"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Newspaper size={16} />}
        {busy ? "Writing..." : "Write the reaction"}
      </button>

      {error && (
        <p className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
          {error}
        </p>
      )}

      {unsourced.length > 0 && (
        <div className="space-y-1 rounded-xl border border-warn bg-warn/10 p-3">
          <p className="flex items-center gap-1.5 text-sm font-medium text-warn">
            <AlertTriangle size={15} />
            Check these numbers before you post this
          </p>
          <p className="text-xs text-warn/90">
            {unsourced.join(", ")} {unsourced.length === 1 ? "does" : "do"} not
            appear in what you pasted or in your verified facts. Either it came
            from somewhere you did not give it, or it was worked out from
            another number. Both of those go out under your license.
          </p>
        </div>
      )}

      {draft && (
        <div className="space-y-3 rounded-xl border border-border bg-panel p-3">
          {draft.hook && <p className="text-base font-medium text-text">{draft.hook}</p>}
          {draft.body && (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-text">{draft.body}</p>
          )}
          {draft.caption && (
            <div className="rounded-lg border border-border bg-panel-2 p-2">
              <p className="text-xs text-faint">Caption</p>
              <p className="whitespace-pre-wrap text-sm text-text">{draft.caption}</p>
            </div>
          )}
          {draft.notes && <p className="text-xs text-faint">{draft.notes}</p>}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(whole).then(
                  () => { setCopied(true); setTimeout(() => setCopied(false), 1600); },
                  () => setError("Could not copy. Select it and copy by hand."),
                );
              }}
              className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-muted"
            >
              {copied ? <Check size={15} className="text-accent" /> : <Copy size={15} />}
              {copied ? "Copied" : "Copy it"}
            </button>
            <button
              type="button"
              disabled={pending || kept}
              onClick={() =>
                start(async () => {
                  try {
                    await createIdeaAction({
                      title: headline.trim().slice(0, 180),
                      note: draft.hook || draft.body.slice(0, 400),
                      source: "news",
                    });
                    setKept(true);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Could not keep that.");
                  }
                })
              }
              className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-accent px-3 text-sm text-accent disabled:opacity-40"
            >
              {kept ? <Check size={15} /> : <Lightbulb size={15} />}
              {kept ? "Kept as an idea" : "Keep as an idea"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
