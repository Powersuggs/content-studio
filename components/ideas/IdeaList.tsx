"use client";

import { useState, useTransition } from "react";
import { Archive, Check, Plus } from "lucide-react";
import { toggleOutputAction, archiveIdeaAction } from "@/app/ideas/actions";
import { formatLabel } from "@/lib/ideas/formats";
import type { Idea, IdeaFilter } from "@/lib/ideas/queries";

export default function IdeaList({
  ideas,
  emptyFilter,
  hasAny,
}: {
  ideas: Idea[];
  emptyFilter: IdeaFilter;
  hasAny: boolean;
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
        <IdeaCard key={idea.id} idea={idea} />
      ))}
    </ul>
  );
}

function IdeaCard({ idea }: { idea: Idea }) {
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);

  function toggle(format: string) {
    startTransition(async () => {
      await toggleOutputAction(idea.id, format);
    });
  }

  function archive() {
    startTransition(async () => {
      await archiveIdeaAction(idea.id);
    });
  }

  return (
    <li className="rounded-xl border border-border bg-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-text">{idea.title}</p>
          {idea.note && (
            <p className="mt-1 text-xs text-muted">{idea.note}</p>
          )}
        </div>
        <button
          type="button"
          onClick={archive}
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
            onClick={() => toggle(f)}
            disabled={isPending}
            title="Made. Click to undo."
            className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-[11px] text-accent disabled:opacity-50"
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
                onClick={() => toggle(f)}
                disabled={isPending}
                title="Mark as made"
                className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
              >
                <Plus size={11} strokeWidth={2} />
                {formatLabel(f)}
              </button>
            ))
          : idea.remaining.length > 0 && (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="rounded-full border border-dashed border-border px-2.5 py-1 text-[11px] text-faint hover:border-accent hover:text-accent"
              >
                {idea.made.length === 0
                  ? `${idea.remaining.length} formats on the table`
                  : `${idea.remaining.length} still on the table`}
              </button>
            )}

        {idea.remaining.length === 0 && (
          <span className="text-[11px] text-faint">
            Every format made. Nothing left on this one.
          </span>
        )}
      </div>

      <p className="mt-2 text-[10px] text-faint">
        {idea.source === "capture" ? "Captured" : idea.source}
        {" · "}
        {idea.createdAt.toLocaleDateString()}
      </p>
    </li>
  );
}
