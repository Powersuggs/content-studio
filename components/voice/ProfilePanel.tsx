"use client";

import { useState } from "react";
import { Loader2, Sparkles, RefreshCw } from "lucide-react";
import { buildProfileAction } from "@/app/voice/build-action";

export default function ProfilePanel({
  answered,
  total,
  summary,
  neverSay,
  builtAt,
  answersUsed,
  postsAnalysed,
}: {
  answered: number;
  total: number;
  summary: string | null;
  neverSay: string | null;
  builtAt: string | null;
  answersUsed: number;
  postsAnalysed: number;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [freshSummary, setFreshSummary] = useState<string | null>(null);

  const shown = freshSummary ?? summary;
  const hasProfile = Boolean(shown);
  const stale = hasProfile && answered > answersUsed;
  const canBuild = answered >= 5;

  async function build() {
    setBusy(true);
    setError(null);
    const result = await buildProfileAction();
    setBusy(false);
    if (!result.ok) setError(result.error);
    else setFreshSummary(result.summary);
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-panel p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-medium text-text">Your profile</h2>
          <p className="mt-1 text-sm text-muted">
            {hasProfile
              ? `Built from ${answersUsed} answer${answersUsed === 1 ? "" : "s"}${
                  postsAnalysed > 0 ? ` and ${postsAnalysed} of your own posts` : ""
                }.`
              : canBuild
                ? "Build it now from what you've answered so far, and rebuild it later as you add more."
                : `Answer at least 5 questions to build a profile. You're at ${answered}.`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void build()}
          disabled={busy || !canBuild}
          className="flex shrink-0 items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-bg disabled:opacity-50"
        >
          {busy ? (
            <Loader2 size={15} strokeWidth={2} className="animate-spin" />
          ) : hasProfile ? (
            <RefreshCw size={15} strokeWidth={2} />
          ) : (
            <Sparkles size={15} strokeWidth={2} />
          )}
          {busy ? "Reading..." : hasProfile ? "Rebuild" : "Build profile"}
        </button>
      </div>

      {stale && !busy && (
        <p className="rounded-lg border border-border bg-panel-2 px-3 py-2 text-xs text-muted">
          You&apos;ve answered {answered - answersUsed} more question
          {answered - answersUsed === 1 ? "" : "s"} since this was built. Rebuild to
          include them.
        </p>
      )}

      {error && <p className="text-xs text-warn">{error}</p>}

      {shown && (
        <div className="space-y-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">
              What it found about how you write
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-text">
              {shown}
            </p>
          </div>

          {neverSay && !freshSummary && (
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">
                Things it will never write
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-muted">
                {neverSay}
              </p>
            </div>
          )}

          <p className="text-xs text-muted">
            Read it properly. If any of it is wrong, change the answer it came from and
            rebuild. Everything written for you from here on is shaped by this.
          </p>
        </div>
      )}

      {builtAt && !freshSummary && (
        <p className="text-xs text-muted">
          Last built {new Date(builtAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
        </p>
      )}
    </div>
  );
}
