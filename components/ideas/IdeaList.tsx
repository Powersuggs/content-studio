"use client";

import { useState, useTransition } from "react";
import { Archive, Check, Sparkles, Loader2, Copy, RotateCcw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { toggleOutputAction, archiveIdeaAction } from "@/app/ideas/actions";
import { formatLabel } from "@/lib/ideas/formats";
import type { Idea, IdeaFilter } from "@/lib/ideas/queries";
import type { GeneratedOutput } from "@/lib/ideas/generate";
import SlideStudio, { type PhotoChoice } from "./SlideStudio";

export interface DraftView {
  format: string;
  content: GeneratedOutput | null;
  scriptId: number | null;
  newsletterId: number | null;
}

export default function IdeaList({
  ideas,
  drafts,
  emptyFilter,
  hasAny,
  photos = [],
  handle = null,
}: {
  ideas: Idea[];
  drafts: Record<number, DraftView[]>;
  emptyFilter: IdeaFilter;
  hasAny: boolean;
  photos?: PhotoChoice[];
  handle?: string | null;
}) {
  if (ideas.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-sm text-faint">
        {!hasAny
          ? "No ideas yet. Put the first one in the box above, even if it is half an idea."
          : emptyFilter === "untouched"
            ? "Nothing untouched. Every idea has produced something."
            : "Nothing in progress. Start a format on an idea below."}
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {ideas.map((idea) => (
        <IdeaCard
          key={idea.id}
          idea={idea}
          drafts={drafts[idea.id] ?? []}
          photos={photos}
          handle={handle}
        />
      ))}
    </ul>
  );
}

function IdeaCard({
  idea,
  drafts,
  photos,
  handle,
}: {
  idea: Idea;
  drafts: DraftView[];
  photos: PhotoChoice[];
  handle: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(idea.made.length > 0);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const router = useRouter();

  const byFormat = new Map(drafts.map((d) => [d.format, d]));

  /** Press a format and the app writes it. */
  async function write(format: string) {
    setWorking(format);
    setError(null);
    try {
      const res = await fetch("/api/idea-output", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ideaId: idea.id, format }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? `Could not write the ${formatLabel(format).toLowerCase()}.`);
        return;
      }
      setOpen(format);
      // The draft is saved server-side, so the server is the one copy of
      // it. Refreshing shows it rather than holding a second copy here
      // that could drift from what was stored.
      router.refresh();
    } catch {
      setError("Could not reach the writer. Try again.");
    } finally {
      setWorking(null);
    }
  }

  function untick(format: string) {
    startTransition(async () => {
      await toggleOutputAction(idea.id, format);
      if (open === format) setOpen(null);
    });
  }

  return (
    <li className="rounded-xl border border-border bg-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-text">{idea.title}</p>
          {idea.note && <p className="mt-1 text-xs text-muted">{idea.note}</p>}
        </div>
        <button
          type="button"
          onClick={() => startTransition(async () => { await archiveIdeaAction(idea.id); })}
          disabled={isPending}
          title="Park this idea"
          className="shrink-0 rounded-lg border border-border p-1.5 text-faint transition-colors hover:border-warn hover:text-warn disabled:opacity-40"
        >
          <Archive size={13} strokeWidth={1.75} />
        </button>
      </div>

      {/* What has been made, and what has not. The second half is the
          reason this screen exists, so it is not hidden behind a click. */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {idea.made.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setOpen(open === f ? null : f)}
            title={byFormat.get(f)?.content ? "Written. Click to read it." : "Marked as made elsewhere."}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
              open === f
                ? "border-accent bg-accent text-bg"
                : "border-accent/40 bg-accent/10 text-accent"
            }`}
          >
            <Check size={11} strokeWidth={2.5} />
            {formatLabel(f)}
          </button>
        ))}

        {expanded
          ? idea.remaining.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => write(f)}
                disabled={working !== null || isPending}
                title={`Write the ${formatLabel(f).toLowerCase()} from this idea`}
                className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
              >
                {working === f ? (
                  <Loader2 size={11} strokeWidth={2} className="animate-spin" />
                ) : (
                  <Sparkles size={11} strokeWidth={2} />
                )}
                {working === f ? "Writing…" : formatLabel(f)}
              </button>
            ))
          : idea.remaining.length > 0 && (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="rounded-full border border-dashed border-border px-2.5 py-1 text-[11px] text-faint hover:border-accent hover:text-accent"
              >
                {idea.made.length === 0
                  ? `Write it as one of ${idea.remaining.length} formats`
                  : `${idea.remaining.length} still on the table`}
              </button>
            )}

        {idea.remaining.length === 0 && (
          <span className="text-[11px] text-faint">
            Every format made. Nothing left on this one.
          </span>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-warn">{error}</p>}

      {open && (
        <DraftPanel
          format={open}
          draft={byFormat.get(open) ?? null}
          busy={working === open}
          onRewrite={() => write(open)}
          onRemove={() => untick(open)}
          onClose={() => setOpen(null)}
          ideaId={idea.id}
          photos={photos}
          handle={handle}
        />
      )}

      <p className="mt-2 text-[10px] text-faint">
        {idea.source === "capture" ? "Captured" : idea.source}
        {" · "}
        {idea.createdAt.toLocaleDateString()}
      </p>
    </li>
  );
}

function DraftPanel({
  format,
  draft,
  busy,
  onRewrite,
  onRemove,
  onClose,
  ideaId,
  photos,
  handle,
}: {
  format: string;
  draft: DraftView | null;
  busy: boolean;
  onRewrite: () => void;
  onRemove: () => void;
  onClose: () => void;
  ideaId: number;
  photos: PhotoChoice[];
  handle: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const c = draft?.content ?? null;

  // Everything in one block, in the order it would be used, so one press
  // puts a usable draft on the clipboard rather than a field at a time.
  const plain = c
    ? [
        c.title,
        ...c.parts.map((p, i) => `${i + 2}. ${p}`),
        c.body,
        c.caption && `Caption:\n${c.caption}`,
      ]
        .filter(Boolean)
        .join("\n\n")
    : "";

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-border bg-panel-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-text">{formatLabel(format)}</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onRewrite}
            disabled={busy}
            title="Write it again from the same idea"
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {busy ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
            {busy ? "Writing" : "Rewrite"}
          </button>
          {plain && (
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(plain);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                } catch {
                  setCopied(false);
                }
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent"
            >
              {copied ? <Check size={11} /> : <Copy size={11} />}
              {copied ? "Copied" : "Copy"}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            title="Close"
            className="rounded-lg border border-border p-1 text-faint hover:border-accent hover:text-accent"
          >
            <X size={11} />
          </button>
        </div>
      </div>

      {!c ? (
        <p className="text-xs text-faint">
          This one was ticked off as made elsewhere, so there is nothing stored
          here. Press Rewrite and the app will write it.
        </p>
      ) : (
        <div className="space-y-3">
          {c.title && (
            <p className="text-sm font-medium leading-snug text-text">{c.title}</p>
          )}

          {c.parts.length > 0 && (
            <ol className="space-y-2">
              {c.parts.map((p, i) => (
                <li key={i} className="flex gap-2 text-sm text-text">
                  <span className="shrink-0 tabular-nums text-faint">{i + 2}.</span>
                  <span className="whitespace-pre-wrap">{p}</span>
                </li>
              ))}
            </ol>
          )}

          {c.body && (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-text">
              {c.body}
            </p>
          )}

          {c.caption && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-faint">Caption</p>
              <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted">{c.caption}</p>
            </div>
          )}

          {c.notes && (
            <p className="rounded-md border border-border bg-panel px-2 py-1.5 text-[11px] text-muted">
              {c.notes}
            </p>
          )}

          {format === "carousel" && c && (
            <SlideStudio
              ideaId={ideaId}
              format={format}
              title={c.title}
              parts={c.parts}
              sub=""
              photos={photos}
              handle={handle}
              initialPlan={c.plan ?? null}
            />
          )}

          {(draft?.newsletterId || draft?.scriptId) && (
            <p className="text-[11px] text-faint">
              {draft.newsletterId ? (
                <>
                  Saved as a draft on your{" "}
                  <a href="/newsletter" className="text-accent hover:underline">
                    Newsletter
                  </a>{" "}
                  page too.
                </>
              ) : (
                <>
                  Saved to your script queue for{" "}
                  <a href="/session-mode" className="text-accent hover:underline">
                    Session Mode
                  </a>
                  .
                </>
              )}
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onRemove}
        className="text-[11px] text-faint underline underline-offset-2 hover:text-warn"
      >
        Not made after all, untick it
      </button>
    </div>
  );
}
