"use client";

import { useState, useTransition } from "react";
import { Search, Plus, ExternalLink, Trash2, Loader2 } from "lucide-react";
import MicButton from "@/components/voice/MicButton";
import {
  addLeadAction,
  deleteLeadAction,
  findLeadsAction,
  setLeadNoteAction,
  setLeadStatusAction,
} from "@/app/leads/actions";
import { LEAD_STATUSES, type Lead, type LeadStatus } from "@/lib/leads/types";

/** The colour each state is shown in, so the list reads at a glance. */
const TONE: Record<LeadStatus, string> = {
  "new": "border-border text-muted",
  "to contact": "border-accent/50 bg-accent/10 text-accent",
  "contacted": "border-idea/50 bg-idea/10 text-idea",
  "replied": "border-accent bg-accent/15 text-accent",
  "not a fit": "border-border text-faint",
};

export default function LeadList({
  leads,
  counts,
  waiting,
}: {
  leads: Lead[];
  counts: Record<string, number>;
  waiting: number;
}) {
  const [filter, setFilter] = useState<LeadStatus | "all">("all");
  const [handle, setHandle] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const shown = filter === "all" ? leads : leads.filter((l) => l.status === filter);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-text">Leads</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Everyone here is an account you already looked at: saved to a board,
          reverse-engineered on Inspiration, or torn down. This page does not
          go searching Instagram for strangers, and nothing is scraped.
        </p>
      </div>

      {/* Pull in anyone collected elsewhere in the app. */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-panel p-3">
        <button
          type="button"
          disabled={pending || waiting === 0}
          onClick={() =>
            start(async () => {
              setError(null);
              try {
                const { added } = await findLeadsAction();
                setMessage(
                  added === 0
                    ? "Nothing new. Everyone the app knows about is already here."
                    : `Added ${added}.`,
                );
              } catch (e) {
                setError(e instanceof Error ? e.message : "That did not work.");
              }
            })
          }
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-medium text-bg disabled:opacity-40"
        >
          {pending ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
          {waiting > 0 ? `Find ${waiting} more in the app` : "Nothing new to find"}
        </button>
        {message && <span className="text-xs text-muted">{message}</span>}
      </div>

      {/* Add one by hand, which is how anyone found outside the app gets in. */}
      <div className="space-y-2 rounded-xl border border-border bg-panel p-3">
        <p className="text-xs text-faint">Add someone yourself</p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="theirhandle"
            className="min-w-0 flex-1 rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-text outline-none focus:border-accent"
          />
          <button
            type="button"
            disabled={pending || !handle.trim()}
            onClick={() =>
              start(async () => {
                setError(null);
                try {
                  await addLeadAction(handle, note);
                  setHandle("");
                  setNote("");
                  setMessage("Added.");
                } catch (e) {
                  setError(e instanceof Error ? e.message : "That did not work.");
                }
              })
            }
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-accent px-3 text-sm font-medium text-accent disabled:opacity-40"
          >
            <Plus size={15} /> Add
          </button>
        </div>
        <div className="flex items-start gap-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Why them? What you noticed."
            className="min-w-0 flex-1 resize-none rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-text outline-none focus:border-accent"
          />
          <MicButton value={note} onChange={setNote} onError={setError} label="" size="sm" />
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-1.5">
        {(["all", ...LEAD_STATUSES] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={`h-9 rounded-lg border px-3 text-xs ${
              filter === s ? "border-accent bg-accent/10 text-accent" : "border-border text-muted"
            }`}
          >
            {s === "all" ? `All ${leads.length}` : `${s} ${counts[s] ?? 0}`}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-faint">
          {leads.length === 0
            ? "Nobody here yet. Save a post on Inspiration or a board, then press Find above."
            : "None with that status."}
        </p>
      ) : (
        <ul className="space-y-2">
          {shown.map((lead) => (
            <LeadRow key={lead.id} lead={lead} onError={setError} />
          ))}
        </ul>
      )}
    </div>
  );
}

function LeadRow({ lead, onError }: { lead: Lead; onError: (m: string | null) => void }) {
  const [note, setNote] = useState(lead.note ?? "");
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  const save = (next: string) => {
    setNote(next);
    start(async () => {
      try {
        await setLeadNoteAction(lead.id, next);
      } catch (e) {
        onError(e instanceof Error ? e.message : "The note did not save.");
      }
    });
  };

  return (
    <li className="rounded-xl border border-border bg-panel p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="min-w-0 flex-1 text-left"
        >
          <span className="text-sm font-medium text-text">@{lead.handle}</span>{" "}
          <span className="text-xs text-faint">
            {lead.source === "manual" ? "added by you" : `from ${lead.source}`}
            {lead.posts_seen > 0 && `, ${lead.posts_seen} post${lead.posts_seen === 1 ? "" : "s"} saved`}
          </span>
        </button>
        <a
          href={`https://instagram.com/${lead.handle}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted"
          aria-label={`Open @${lead.handle} on Instagram`}
        >
          <ExternalLink size={14} />
        </a>
        <span className={`rounded-full border px-2 py-1 text-[11px] ${TONE[lead.status]}`}>
          {lead.status}
        </span>
      </div>

      {open && (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          <div className="flex flex-wrap gap-1.5">
            {LEAD_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                disabled={pending || s === lead.status}
                onClick={() =>
                  start(async () => {
                    try {
                      await setLeadStatusAction(lead.id, s);
                    } catch (e) {
                      onError(e instanceof Error ? e.message : "That did not save.");
                    }
                  })
                }
                className={`h-9 rounded-lg border px-2.5 text-[11px] disabled:opacity-40 ${
                  s === lead.status ? TONE[s] : "border-border text-muted"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex items-start gap-2">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => save(note)}
              rows={2}
              placeholder="What you said, what they said, what to try next."
              className="min-w-0 flex-1 resize-none rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-text outline-none focus:border-accent"
            />
            <MicButton value={note} onChange={save} onError={onError} label="" size="sm" />
          </div>
          <div className="flex items-center gap-2">
            {lead.last_touched && (
              <span className="text-[11px] text-faint">
                last touched {new Date(lead.last_touched).toLocaleDateString()}
              </span>
            )}
            {confirming ? (
              <span className="ml-auto flex items-center gap-2 text-[11px]">
                <span className="text-warn">Remove from the list?</span>
                <button
                  type="button"
                  onClick={() =>
                    start(async () => {
                      try {
                        await deleteLeadAction(lead.id);
                      } catch (e) {
                        onError(e instanceof Error ? e.message : "That did not work.");
                      }
                    })
                  }
                  className="rounded-full border border-warn px-2 py-1 text-warn"
                >
                  Remove
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="rounded-full border border-border px-2 py-1 text-muted"
                >
                  Keep
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="ml-auto flex h-9 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[11px] text-muted"
              >
                <Trash2 size={12} /> Remove
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
