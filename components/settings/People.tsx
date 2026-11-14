"use client";

import { useState, useTransition } from "react";
import { Users, RotateCcw, Copy, Check, AlertCircle } from "lucide-react";
import { resetPasswordAction } from "@/app/settings/actions";
import type { Person } from "@/lib/auth/people";

/**
 * Everyone with an account, and a way to get them back in.
 *
 * There is no email provider, so there is no reset link to send. This
 * is the stand-in: set them a new password and tell them what it is.
 *
 * The new password is shown exactly once, here, and is never stored
 * anywhere readable. So the panel says so plainly, and keeps it on
 * screen until it is dismissed rather than clearing itself after a few
 * seconds, which would be a way to lose it.
 */
export default function People({ people }: { people: Person[] }) {
  const [issued, setIssued] = useState<{ id: number; email: string | null; password: string } | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-3">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-text">
          <Users size={15} />
          People ({people.length})
        </h2>
        <p className="mt-1 text-sm text-muted">
          If someone forgets their password, set them a new one here and send
          it to them. They can change it themselves once they are in.
        </p>
      </div>

      {error && (
        <p className="flex items-start gap-1.5 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}

      {issued && (
        <div className="space-y-2 rounded-xl border border-accent bg-accent/10 p-3">
          <p className="text-sm font-medium text-accent">
            New password for {issued.email ?? `account ${issued.id}`}
          </p>
          <p className="font-mono text-lg tracking-wide text-text">{issued.password}</p>
          <p className="text-xs text-muted">
            This is the only time it is shown. Send it to them before you close
            this, then tell them to change it in Settings.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                navigator.clipboard?.writeText(issued.password).then(
                  () => { setCopied(true); setTimeout(() => setCopied(false), 1600); },
                  () => setError("Could not copy. Select it and copy by hand."),
                )
              }
              className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-medium text-bg"
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? "Copied" : "Copy it"}
            </button>
            <button
              type="button"
              onClick={() => setIssued(null)}
              className="inline-flex h-11 items-center rounded-lg border border-border px-3 text-sm text-muted"
            >
              I have sent it
            </button>
          </div>
        </div>
      )}

      <ul className="space-y-2">
        {people.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-panel p-3">
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-text">
                {p.email ?? <span className="text-faint">no email set</span>}
              </span>
              <span className="block text-xs text-faint">
                {p.role}
                {p.status !== "active" && `, ${p.status}`}
                {!p.has_password && ", no password yet"}
              </span>
            </span>
            {confirming === p.id ? (
              <span className="flex items-center gap-2 text-[11px]">
                <span className="text-warn">Replace their password?</span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      setError(null);
                      try {
                        const result = await resetPasswordAction(p.id);
                        setIssued({ id: p.id, ...result });
                        setConfirming(null);
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "That did not work.");
                      }
                    })
                  }
                  className="rounded-full border border-warn px-2 py-1 text-warn"
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(null)}
                  className="rounded-full border border-border px-2 py-1 text-muted"
                >
                  No
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(p.id)}
                className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-muted"
              >
                <RotateCcw size={14} />
                New password
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
