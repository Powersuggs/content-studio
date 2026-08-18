"use client";

import { useState, useTransition } from "react";
import { Trash2, Check, X } from "lucide-react";
import { deleteLendingFactAction } from "@/app/settings/actions";

export default function DeleteLendingFactButton({ id }: { id: number }) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px]">
        <span className="text-muted">Delete this?</span>
        <button
          type="button"
          onClick={() =>
            startTransition(async () => {
              await deleteLendingFactAction(id);
            })
          }
          disabled={isPending}
          className="rounded-md bg-warn/15 p-1 text-warn hover:bg-warn/25 disabled:opacity-50"
        >
          <Check size={12} />
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={isPending}
          className="rounded-md bg-panel-2 p-1 text-faint hover:text-muted disabled:opacity-50"
        >
          <X size={12} />
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="inline-flex items-center gap-1 text-[11px] text-faint hover:text-warn"
    >
      <Trash2 size={12} />
      Delete
    </button>
  );
}
