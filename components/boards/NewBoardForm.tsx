"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { createBoardAction } from "@/app/boards/actions";

export default function NewBoardForm() {
  const [name, setName] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function submit() {
    if (!name.trim()) return;
    const formData = new FormData();
    formData.set("name", name.trim());
    startTransition(async () => {
      const id = await createBoardAction(formData);
      setName("");
      if (id) router.push(`/boards/${id}`);
      else router.refresh();
    });
  }

  return (
    <div className="flex gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="New board name"
        className="flex-1 rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-text outline-none focus:border-accent"
      />
      <button
        type="button"
        onClick={submit}
        disabled={isPending || !name.trim()}
        className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-bg disabled:opacity-50"
      >
        <Plus size={15} /> Create
      </button>
    </div>
  );
}
