"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

type Phase = "idle" | "starting" | "syncing" | "error";

const POLL_INTERVAL_MS = 3000;

export default function SyncButton({
  initialLastSyncedAt,
}: {
  initialLastSyncedAt: string | null;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const baselineRef = useRef(initialLastSyncedAt);
  const pollIdRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollIdRef.current) clearInterval(pollIdRef.current);
    };
  }, []);

  async function trigger() {
    setPhase("starting");
    try {
      const res = await fetch("/api/sync/trigger", { method: "POST" });
      if (!res.ok) throw new Error("Failed to start sync");
    } catch {
      setPhase("error");
      return;
    }

    setPhase("syncing");
    const startedAt = Date.now();
    const MAX_POLL_MS = 3 * 60 * 1000; // give up after 3 minutes either way

    // Poll the small status endpoint rather than waiting on the trigger
    // request itself -- a full sync can take minutes, well past what a
    // browser (or the serverless function) should hold a connection open
    // for. We're done once last_synced_at actually moves past the value
    // it had when we started, OR the server reports it's no longer
    // running (which covers both "finished" and "failed").
    pollIdRef.current = setInterval(async () => {
      try {
        const res = await fetch("/api/sync/status");
        const data: { sync_status: string; last_synced_at: string | null } =
          await res.json();

        const moved =
          data.last_synced_at && data.last_synced_at !== baselineRef.current;
        const stillRunning = data.sync_status === "running";
        const timedOut = Date.now() - startedAt > MAX_POLL_MS;

        if (moved) {
          if (pollIdRef.current) clearInterval(pollIdRef.current);
          setPhase("idle");
          // Simplest reliable way to pull fresh server-rendered data
          // everywhere on the page after a background sync completes.
          window.location.reload();
          return;
        }

        if (!stillRunning || timedOut) {
          // The lock was released but the timestamp never moved -- the
          // sync ran and failed (or we gave up waiting). Either way,
          // stop spinning forever and tell the person plainly.
          if (pollIdRef.current) clearInterval(pollIdRef.current);
          setPhase("error");
        }
      } catch {
        // transient network hiccup while polling -- keep trying
      }
    }, POLL_INTERVAL_MS);
  }

  const label =
    phase === "starting"
      ? "Starting…"
      : phase === "syncing"
        ? "Syncing…"
        : phase === "error"
          ? "Sync failed — retry"
          : "Sync now";

  return (
    <button
      type="button"
      onClick={trigger}
      disabled={phase === "starting" || phase === "syncing"}
      className="inline-flex items-center gap-2 rounded-lg border border-border bg-panel-2 px-3 py-1.5 text-sm text-text hover:border-accent/50 disabled:opacity-60"
    >
      <RefreshCw size={14} className={phase === "syncing" || phase === "starting" ? "animate-spin" : ""} />
      {label}
    </button>
  );
}
