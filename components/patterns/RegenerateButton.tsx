"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";

export default function RegenerateButton() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function run() {
    setError(null);
    startTransition(async () => {
      // This can be a genuinely long-running request (up to 300 posts
      // of history to reason across), so failures here -- a dropped
      // connection, a server timeout, anything -- must not leave the
      // button stuck on "Regenerating..." forever. Every exit path
      // through this function needs to land on either success or a
      // visible error, never neither.
      try {
        const res = await fetch("/api/insights", { method: "POST" });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Couldn't regenerate insights");
          return;
        }
        router.refresh();
      } catch {
        setError("Couldn't reach the server -- check your connection and try again.");
      }
    });
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={run}
        disabled={isPending}
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-panel-2 px-3 py-1.5 text-sm text-text hover:border-accent/50 disabled:opacity-50"
      >
        <RefreshCw size={14} className={isPending ? "animate-spin" : ""} />
        {isPending ? "Regenerating…" : "Regenerate"}
      </button>
      {error && <p className="text-xs text-warn">{error}</p>}
    </div>
  );
}
