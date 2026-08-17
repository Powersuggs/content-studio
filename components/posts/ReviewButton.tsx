"use client";

import { useState, useTransition } from "react";
import { Stethoscope } from "lucide-react";
import { useRouter } from "next/navigation";

export default function ReviewButton({ postId }: { postId: number }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function run() {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Review failed");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={run}
        disabled={isPending}
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-panel-2 px-3 py-1.5 text-sm text-text hover:border-accent/50 disabled:opacity-50"
      >
        <Stethoscope size={14} />
        {isPending ? "Reviewing…" : "Run AI review"}
      </button>
      {error && <p className="mt-2 text-xs text-warn">{error}</p>}
    </div>
  );
}
