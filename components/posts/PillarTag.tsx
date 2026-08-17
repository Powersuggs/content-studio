"use client";

import { useState, useTransition } from "react";
import { Tag, Check, X } from "lucide-react";
import { updatePillarAction } from "@/app/posts/actions";

export default function PillarTag({
  postId,
  pillar,
  suggestions,
}: {
  postId: number;
  pillar: string | null;
  suggestions: string[];
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(pillar ?? "");
  const [isPending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      await updatePillarAction(postId, value.trim() || null);
      setEditing(false);
    });
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue(pillar ?? "");
          setEditing(true);
        }}
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-panel-2 px-2.5 py-1 text-xs text-muted hover:border-accent/50 hover:text-text"
      >
        <Tag size={12} />
        {pillar || "Tag a pillar"}
      </button>
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5">
      <input
        list={`pillar-suggestions-${postId}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
        autoFocus
        placeholder="e.g. VA Loans, Client Story"
        className="w-44 rounded-lg border border-accent/40 bg-panel-2 px-2 py-1 text-xs text-text outline-none"
      />
      <datalist id={`pillar-suggestions-${postId}`}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <button
        type="button"
        onClick={save}
        disabled={isPending}
        className="rounded-md bg-accent/15 p-1 text-accent hover:bg-accent/25 disabled:opacity-50"
      >
        <Check size={13} />
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        disabled={isPending}
        className="rounded-md bg-panel-2 p-1 text-faint hover:text-muted disabled:opacity-50"
      >
        <X size={13} />
      </button>
    </div>
  );
}
