"use client";

import { useState, useTransition } from "react";
import { KeyRound, Check, AlertCircle } from "lucide-react";
import { changeMyPasswordAction } from "@/app/settings/actions";

/**
 * Changing your own password.
 *
 * This is what makes the owner's reset button usable rather than
 * harmful: a temporary password sent over a message stays that person's
 * password forever unless they can replace it themselves.
 *
 * Collapsed by default. It is a thing people do twice a year, and an
 * open form at the top of Settings would be in the way the rest of the
 * time.
 */
export default function MyPassword() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setError(null);
    if (next !== confirm) {
      setError("The two new passwords do not match.");
      return;
    }
    start(async () => {
      try {
        await changeMyPasswordAction(current, next);
        setCurrent("");
        setNext("");
        setConfirm("");
        setDone(true);
        setOpen(false);
        setTimeout(() => setDone(false), 4000);
      } catch (e) {
        setError(e instanceof Error ? e.message : "That did not work.");
      }
    });
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm text-muted"
        >
          <KeyRound size={15} />
          Change my password
        </button>
        {done && (
          <span className="inline-flex items-center gap-1 text-xs text-accent">
            <Check size={14} /> Changed. Use the new one next time you sign in.
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-border bg-panel p-3">
      <p className="text-sm font-semibold text-text">Change my password</p>
      <input
        type="password"
        autoComplete="current-password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        placeholder="Current password"
        className="w-full rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-text outline-none focus:border-accent"
      />
      <input
        type="password"
        autoComplete="new-password"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        placeholder="New password"
        className="w-full rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-text outline-none focus:border-accent"
      />
      <input
        type="password"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder="New password again"
        className="w-full rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-text outline-none focus:border-accent"
      />
      <p className="text-[11px] text-faint">
        At least 10 characters. Any letters, numbers or symbols.
      </p>
      {error && (
        <p className="flex items-start gap-1.5 text-xs text-warn">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || !current || !next}
          onClick={save}
          className="inline-flex h-11 items-center rounded-lg bg-accent px-4 text-sm font-medium text-bg disabled:opacity-40"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
            setCurrent("");
            setNext("");
            setConfirm("");
          }}
          className="inline-flex h-11 items-center rounded-lg border border-border px-4 text-sm text-muted"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
