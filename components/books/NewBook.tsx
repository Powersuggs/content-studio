"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookPlus, Loader2 } from "lucide-react";
import MicButton from "@/components/voice/MicButton";
import TitleSuggestions from "@/components/books/TitleSuggestions";
import { createBookAction } from "@/app/books/actions";

/**
 * Starting a book.
 *
 * THE ORDER OF THE FIELDS IS THE POINT
 * What it argues comes first and the name comes last, which is the reverse
 * of how a form like this is usually built. The reason is that the name is
 * the hardest part and the argument is the part he can say out loud in one
 * breath. Asking for the title first means sitting on a blank box, and a
 * book that cannot be named does not get created.
 *
 * So: say the idea, press Suggest titles, pick one, create. The title and
 * subtitle boxes are still there to type in directly, because a title he
 * already loves should not have to be routed through a suggestion.
 *
 * TITLE AND SUBTITLE ARE TWO FIELDS
 * They are two different jobs. The title gets attention and the subtitle
 * carries the promise. One box with a colon in it collapses that into a
 * single line nobody edits, and it is the reason the suggestions come back
 * as two strings rather than one.
 */
export default function NewBook() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [premise, setPremise] = useState("");
  const [audience, setAudience] = useState("");
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
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
      <div>
        <p className="text-xs text-faint">What does it argue?</p>
        <div className="mt-1 flex items-start gap-2">
          <textarea
            value={premise}
            onChange={(e) => setPremise(e.target.value)}
            rows={3}
            placeholder="Say it out loud, the way you would to someone across a table."
            className="min-w-0 flex-1 resize-none rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-text outline-none focus:border-accent"
          />
          <MicButton value={premise} onChange={setPremise} onError={setError} label="" size="sm" />
        </div>
      </div>

      <div>
        <p className="text-xs text-faint">Who is it for?</p>
        <div className="mt-1 flex items-start gap-2">
          <textarea
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            rows={2}
            placeholder="The more specific, the better the titles."
            className="min-w-0 flex-1 resize-none rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-text outline-none focus:border-accent"
          />
          <MicButton value={audience} onChange={setAudience} onError={setError} label="" size="sm" />
        </div>
      </div>

      <TitleSuggestions
        premise={premise}
        audience={audience}
        currentTitle={title}
        onPick={({ title: t, subtitle: s }) => {
          setTitle(t);
          setSubtitle(s);
        }}
      />

      <div className="space-y-2 border-t border-border pt-3">
        <div>
          <p className="text-xs text-faint">Title</p>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Short. Said out loud it should stick."
            className="mt-1 w-full rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-text outline-none focus:border-accent"
          />
        </div>
        <div>
          <p className="text-xs text-faint">Subtitle</p>
          <input
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder="The whole promise, in a line."
            className="mt-1 w-full rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-text outline-none focus:border-accent"
          />
        </div>
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
                const { id } = await createBookAction({
                  title,
                  subtitle,
                  premise,
                  audience,
                });
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
