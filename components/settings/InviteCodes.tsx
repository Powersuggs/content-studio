"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Ticket, X } from "lucide-react";
import {
  createInviteAction,
  revokeInviteAction,
} from "@/app/settings/actions";
import type { InviteCode } from "@/lib/auth/invites";

/**
 * Invite codes, for the owner.
 *
 * Shown only to the owner account. A member seeing a "create invites" panel
 * they are not allowed to use is worse than not seeing it.
 */
export default function InviteCodes({ initial }: { initial: InviteCode[] }) {
  const [codes, setCodes] = useState(initial);
  const [note, setNote] = useState("");
  const [multi, setMulti] = useState(false);
  const [justCreated, setJustCreated] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function create() {
    startTransition(async () => {
      const code = await createInviteAction({
        note,
        maxUses: multi ? 10 : 1,
      });
      setNote("");
      setJustCreated(code);
      setCodes((prev) => [
        {
          code,
          note: note.trim() || null,
          maxUses: multi ? 10 : 1,
          uses: 0,
          expiresAt: null,
          revokedAt: null,
          createdAt: new Date(),
          status: "active" as const,
        },
        ...prev,
      ]);
    });
  }

  function revoke(code: string) {
    startTransition(async () => {
      await revokeInviteAction(code);
      setCodes((prev) =>
        prev.map((c) =>
          c.code === code ? { ...c, status: "revoked" as const, revokedAt: new Date() } : c,
        ),
      );
    });
  }

  return (
    <section className="space-y-3 rounded-xl border border-border bg-panel p-4">
      <div className="flex items-center gap-2">
        <Ticket size={18} strokeWidth={1.75} className="text-accent" />
        <h2 className="text-sm font-semibold text-text">Invite people</h2>
      </div>

      <p className="text-xs text-muted">
        Each code lets one person create their own account, with their own
        Instagram, their own posts and their own voice profile. They cannot see
        anything of yours and you cannot see theirs.
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1 space-y-1">
          <span className="text-xs text-muted">Who is it for? (optional)</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Sarah, Rise Up Team"
            className="w-full rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-text outline-none placeholder:text-faint focus:border-accent"
          />
        </label>
        <button
          type="button"
          onClick={create}
          disabled={isPending}
          className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-bg disabled:opacity-60"
        >
          {isPending ? "Creating" : "Create code"}
        </button>
      </div>

      <label className="flex items-center gap-2 text-xs text-muted">
        <input
          type="checkbox"
          checked={multi}
          onChange={(e) => setMulti(e.target.checked)}
          className="accent-[var(--accent)]"
        />
        Let up to 10 people use this one code
      </label>

      {justCreated && <NewCode code={justCreated} />}

      {codes.length > 0 && (
        <ul className="space-y-2 border-t border-border pt-3">
          {codes.map((c) => (
            <li
              key={c.code}
              className="flex flex-wrap items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <p className="font-mono text-xs text-text">{c.code}</p>
                <p className="text-[11px] text-faint">
                  {c.note ? `${c.note} - ` : ""}
                  {c.status}
                  {c.maxUses > 1 ? ` (${c.uses} of ${c.maxUses} used)` : ""}
                </p>
              </div>
              {c.status === "active" && (
                <button
                  type="button"
                  onClick={() => revoke(c.code)}
                  disabled={isPending}
                  title="Revoke this code"
                  className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] text-muted transition-colors hover:border-warn hover:text-warn disabled:opacity-60"
                >
                  <X size={12} strokeWidth={2} />
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The code, big enough to read out loud, with the signup link beside it.
 * A code with no instructions is a support question waiting to happen.
 */
function NewCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const signupUrl =
    typeof window !== "undefined" ? `${window.location.origin}/signup` : "/signup";

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${signupUrl}\n\nYour invite code: ${code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused; the code is on screen regardless.
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-accent/40 bg-accent/10 p-3">
      <p className="text-xs text-muted">Send them this:</p>
      <p className="break-all font-mono text-sm text-text">{code}</p>
      <p className="break-all text-[11px] text-muted">{signupUrl}</p>
      <button
        type="button"
        onClick={copy}
        className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent"
      >
        {copied ? <Check size={12} strokeWidth={2} /> : <Copy size={12} strokeWidth={1.75} />}
        {copied ? "Copied" : "Copy link and code"}
      </button>
    </div>
  );
}
