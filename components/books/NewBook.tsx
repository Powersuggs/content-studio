"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookPlus, Loader2 } from "lucide-react";
import MicButton from "@/components/voice/MicButton";
import { createBookAction } from "@/app/books/actions";

/**
 * Starting a book.
 *
 * Three questions, and only the first is required. The premise is the
 * one that actually matters, because it is what every chapter gets
 * drafted against, so it is asked for here rather than left to be filled
 * in later and forgotten. But a book with a title and nothing else still
 * saves: refusing to create it until the premise is right is how a book
 * never gets started.
 */
export default function NewBook() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [premise, setPremise] = useState("");
  const [audience, setAudience] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-11 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-bg"
      >
        <BookPlus size={16} />
        Start a book
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-panel p-3">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What is it called"
        className="w-full rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-text outline-none focus:border-accent"
      />
      <div className="flex items-start gap-2">
        <textarea
          value={premise}
          onChange={(e) => setPremise(e.target.value)}
          rows={3}
          placeholder="What does it argue? Say it out loud, the way you would to someone across a table."
          className="min-w-0 flex-1 resize-none rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-text outline-none focus:border-accent"
        />
        <MicButton value={premise} onChange={setPremise} onError={setError} label="" size="sm" />
      </div>
      <div className="flex items-start gap-2">
        <textarea
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
          rows={2}
          placeholder="Who is it for"
          className="min-w-0 flex-1 resize-none rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-text outline-none focus:border-accent"
        />
        <MicButton value={audience} onChange={setAudience} onError={setError} label="" size="sm" />
      </div>
      {error && <p className="text-xs text-warn">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || !title.trim()}
          onClick={() =>
            start(async () => {
              setError(null);
              try {
                const { id } = await createBookAction({ title, premise, audience });
                router.push(`/books/${id}`);
              } catch (e) {
                setError(e instanceof Error ? e.message : "That did not save.");
              }
            })
          }
          className="inline-flex h-11 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-bg disabled:opacity-40"
        >
          {pending ? <Loader2 size={16} className="animate-spin" /> : <BookPlus size={16} />}
          Create
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="inline-flex h-11 items-center rounded-lg border border-border px-4 text-sm text-muted"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
