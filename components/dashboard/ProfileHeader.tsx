"use client";

import { useState, useTransition } from "react";
import { updateProfileAction } from "@/app/dashboard/actions";
import type { ProfileHeaderData } from "@/lib/queries";

function initialsFrom(name: string | null, handle: string | null): string {
  const source = (name ?? handle ?? "").trim();
  if (!source) return "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** A span that becomes a text input on click and saves on blur/Enter. */
function EditableText({
  value,
  placeholder,
  className,
  onSave,
  multiline = false,
}: {
  value: string;
  placeholder: string;
  className?: string;
  onSave: (next: string) => void;
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed !== value) onSave(trimmed);
  }

  if (editing) {
    const shared = {
      autoFocus: true,
      value: draft,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setDraft(e.target.value),
      onBlur: commit,
      className: `${className ?? ""} w-full rounded-md border border-border bg-panel-2 px-2 py-1 outline-none focus:border-accent`,
    };
    if (multiline) {
      return (
        <textarea
          {...shared}
          rows={2}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commit();
            if (e.key === "Escape") {
              setDraft(value);
              setEditing(false);
            }
          }}
        />
      );
    }
    return (
      <input
        {...shared}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      className={`${className ?? ""} rounded-md px-2 py-1 text-left hover:bg-panel-2`}
    >
      {value ? value : <span className="text-faint">{placeholder}</span>}
    </button>
  );
}

export default function ProfileHeader({ data }: { data: ProfileHeaderData }) {
  const [isPending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState(data);

  function save(patch: {
    display_name?: string;
    handle?: string;
    bio?: string;
    followers_count?: number;
  }) {
    setOptimistic((prev) => ({ ...prev, ...patch }));
    startTransition(() => {
      void updateProfileAction(patch);
    });
  }

  return (
    <section className="rounded-xl border border-border bg-panel p-5 md:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-6">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-accent/15 text-lg font-semibold text-accent">
          {initialsFrom(optimistic.display_name, optimistic.handle)}
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <EditableText
            value={optimistic.display_name ?? ""}
            placeholder="Your name"
            className="text-lg font-semibold text-text"
            onSave={(v) => save({ display_name: v })}
          />
          <EditableText
            value={optimistic.handle ?? ""}
            placeholder="@handle"
            className="text-sm text-muted"
            onSave={(v) => save({ handle: v.replace(/^@/, "") })}
          />
          <EditableText
            value={optimistic.bio ?? ""}
            placeholder="Add a bio"
            className="text-sm text-muted"
            onSave={(v) => save({ bio: v })}
            multiline
          />
        </div>

        <dl className="flex shrink-0 items-start gap-6 self-start md:pl-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-faint">Followers</dt>
            <dd className="mt-0.5">
              <EditableText
                value={String(optimistic.followers_count)}
                placeholder="0"
                className="text-base font-semibold text-text"
                onSave={(v) => {
                  const n = Number(v.replace(/[^0-9]/g, ""));
                  save({ followers_count: Number.isFinite(n) ? n : 0 });
                }}
              />
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-faint">Likes</dt>
            <dd className="mt-0.5 px-2 py-1 text-base font-semibold text-text">
              {formatCount(optimistic.total_likes)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-faint">Videos</dt>
            <dd className="mt-0.5 px-2 py-1 text-base font-semibold text-text">
              {formatCount(optimistic.video_count)}
            </dd>
          </div>
        </dl>
      </div>
      {isPending && (
        <p className="mt-2 text-xs text-faint">Saving…</p>
      )}
    </section>
  );
}
