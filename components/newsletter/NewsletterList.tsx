"use client";

import { useState, useTransition } from "react";
import { Copy, Check, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import MicButton from "@/components/voice/MicButton";
import {
  saveNewsletterEditAction,
  setNewsletterStatusAction,
  deleteNewsletterAction,
} from "@/app/newsletter/actions";

export interface NewsletterItem {
  id: number;
  subject: string;
  subjectAlts: string[];
  body: string;
  status: "draft" | "ready" | "sent";
  topic: string | null;
  createdAt: string;
}

const STATUSES: { id: NewsletterItem["status"]; label: string }[] = [
  { id: "draft", label: "Draft" },
  { id: "ready", label: "Ready" },
  { id: "sent", label: "Sent" },
];

export default function NewsletterList({ items }: { items: NewsletterItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-sm text-faint">
        No emails yet. Write the first one above. A reel reaches people the
        algorithm decides to show it to; an email reaches the people who
        asked to hear from you.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <Row key={item.id} item={item} />
      ))}
    </div>
  );
}

function Row({ item }: { item: NewsletterItem }) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState(item.subject);
  const [body, setBody] = useState(item.body);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const dirty = subject !== item.subject || body !== item.body;

  function save() {
    if (!dirty || !subject.trim()) return;
    startTransition(async () => {
      await saveNewsletterEditAction(item.id, { subject: subject.trim(), body });
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    });
  }

  function setStatus(status: NewsletterItem["status"]) {
    if (status === item.status) return;
    startTransition(async () => {
      await setNewsletterStatusAction(item.id, status);
    });
  }

  async function copyAll() {
    // Subject and body together: what gets pasted into an email tool is
    // both, and copying them separately is two trips for no reason.
    const text = `Subject: ${subject}\n\n${body}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard is blocked without a secure context or permission.
      // The textarea below is still selectable, so this is not a dead end.
      setCopied(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-panel">
      <div className="flex flex-wrap items-center gap-2 p-4">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
        >
          {open ? (
            <ChevronDown size={16} className="mt-0.5 shrink-0 text-faint" />
          ) : (
            <ChevronRight size={16} className="mt-0.5 shrink-0 text-faint" />
          )}
          <span className="min-w-0">
            <span className="block text-sm font-medium text-text">
              {item.subject}
            </span>
            <span className="mt-0.5 block text-xs text-faint">
              {new Date(item.createdAt).toLocaleDateString()}
              {item.topic ? ` · ${item.topic}` : ""}
            </span>
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-1">
          {STATUSES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStatus(s.id)}
              disabled={isPending}
              className={`rounded-lg border px-2 py-1 text-[11px] transition-colors ${
                item.status === s.id
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border text-muted hover:border-accent hover:text-accent"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {open && (
        <div className="space-y-4 border-t border-border p-4">
          <label className="block space-y-1.5">
            <span className="text-xs uppercase tracking-wide text-faint">
              Subject
            </span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-text outline-none focus:border-accent"
            />
          </label>

          {item.subjectAlts.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs uppercase tracking-wide text-faint">
                Other subject lines
              </p>
              <div className="flex flex-wrap gap-2">
                {item.subjectAlts.map((alt, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSubject(alt)}
                    className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted transition-colors hover:border-accent hover:text-accent"
                  >
                    {alt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* A div, not a label: a <button> inside a <label> is invalid and
              the click would be forwarded to the textarea instead of
              starting the recording. */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor={`newsletter-body-${item.id}`}
                className="text-xs uppercase tracking-wide text-faint"
              >
                Body
              </label>
              <MicButton
                value={body}
                onChange={setBody}
                onError={setVoiceError}
                label="Dictate"
                size="sm"
              />
            </div>
            <textarea
              id={`newsletter-body-${item.id}`}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={12}
              className="w-full rounded-lg border border-border bg-panel-2 px-3 py-2 font-mono text-[13px] leading-relaxed text-text outline-none focus:border-accent"
            />
          </div>

          {voiceError && <p className="text-xs text-warn">{voiceError}</p>}

          <div className="flex flex-wrap items-center gap-2">
            {dirty ? (
              <button
                type="button"
                onClick={save}
                disabled={isPending || !subject.trim()}
                className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-bg disabled:opacity-50"
              >
                {isPending ? "Saving…" : "Save changes"}
              </button>
            ) : (
              // No button at all when there is nothing to save. A disabled
              // primary button that reads "Saved" looks like an action that
              // is refusing to work.
              <span className="inline-flex items-center gap-1.5 py-2 text-sm text-faint">
                {saved && <Check size={14} className="text-accent" />}
                {saved ? "Saved" : "No unsaved changes"}
              </span>
            )}

            <button
              type="button"
              onClick={copyAll}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted transition-colors hover:border-accent hover:text-accent"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Copied" : "Copy"}
            </button>

            <div className="ml-auto">
              {confirmDelete ? (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      startTransition(async () => {
                        await deleteNewsletterAction(item.id);
                      })
                    }
                    disabled={isPending}
                    className="rounded-lg border border-warn/40 bg-warn/10 px-2.5 py-1.5 text-xs text-warn disabled:opacity-50"
                  >
                    Delete for good
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted"
                  >
                    Keep
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted transition-colors hover:border-warn hover:text-warn"
                >
                  <Trash2 size={13} />
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
