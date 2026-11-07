"use client";

import { useState, useTransition } from "react";
import { Mail, Lightbulb } from "lucide-react";
import { useRouter } from "next/navigation";

interface IdeaOption {
  id: number;
  title: string;
}

/**
 * Starting an email.
 *
 * Two ways in, because both happen: a topic typed from nothing, and an
 * idea already sitting in the pipeline. Picking an idea fills the topic
 * rather than replacing it, so the idea can be narrowed before writing --
 * "rate drop" as an idea is a week of emails, not one.
 */
export default function NewsletterWriter({ ideas }: { ideas: IdeaOption[] }) {
  const [topic, setTopic] = useState("");
  const [ideaId, setIdeaId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const canWrite = topic.trim().length > 0;

  function pickIdea(idea: IdeaOption) {
    const next = ideaId === idea.id ? null : idea.id;
    setIdeaId(next);
    // Only prefill an empty box. Overwriting something they already typed
    // to "help" is how you lose a sentence someone was happy with.
    if (next !== null && !topic.trim()) setTopic(idea.title);
  }

  function write() {
    if (!canWrite) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.trim(), ideaId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Could not write the email. Try again.");
        return;
      }
      setTopic("");
      setIdeaId(null);
      // The draft is saved server-side, so the list below is the one place
      // it lives. Refreshing shows it there rather than holding a second
      // copy in this component that could drift from the saved one.
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-panel p-4">
      <div className="flex items-center gap-2">
        <Mail size={18} strokeWidth={1.75} className="text-accent" />
        <h2 className="text-sm font-semibold text-text">Write an email</h2>
      </div>

      <div className="flex flex-wrap items-start gap-2">
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              write();
            }
          }}
          placeholder="What is this email about?"
          className="min-w-0 flex-1 rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-text outline-none placeholder:text-faint focus:border-accent"
        />
        <button
          type="button"
          onClick={write}
          disabled={!canWrite || isPending}
          className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-bg disabled:opacity-50"
        >
          {isPending ? "Writing…" : "Write it"}
        </button>
      </div>

      {ideas.length > 0 && (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs text-faint">
            <Lightbulb size={13} strokeWidth={1.75} />
            Or start from an idea you have not made an email from yet
          </p>
          <div className="flex flex-wrap gap-2">
            {ideas.map((idea) => (
              <button
                key={idea.id}
                type="button"
                onClick={() => pickIdea(idea)}
                className={`max-w-full truncate rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                  ideaId === idea.id
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border text-muted hover:border-accent hover:text-accent"
                }`}
              >
                {idea.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-warn">{error}</p>}

      <p className="text-xs text-faint">
        Written in your voice, using only the verified facts on your Sources
        &amp; Facts page. Anything it is not sure about it writes around
        rather than guessing at.
      </p>
    </div>
  );
}
