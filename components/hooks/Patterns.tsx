"use client";

import { useState, useTransition } from "react";
import { BookOpen, Plus, Trash2, AlertCircle } from "lucide-react";
import MicButton from "@/components/voice/MicButton";
import {
  addPatternAction,
  deletePatternAction,
  setPatternActiveAction,
} from "@/app/hooks/actions";
import { APPLIES_TO, APPLIES_LABEL, type AppliesTo, type HookPattern } from "@/lib/hooks/render";

/**
 * What he has learned from creators he studies.
 *
 * The form asks for the mechanism before the example, in that order,
 * because a pattern recorded as only an example gets copied as wording
 * rather than applied as a technique, and then every hook sounds like
 * the person he borrowed it from instead of like him.
 */
export default function Patterns({ patterns }: { patterns: HookPattern[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [source, setSource] = useState("");
  const [what, setWhat] = useState("");
  const [example, setExample] = useState("");
  const [appliesTo, setAppliesTo] = useState<AppliesTo>("hook");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Only the spoken-hook ones are what Hook Lab uses, so that is the
  // number worth showing beside its own heading. The rest are real and
  // kept, they are simply waiting for the tool that will read them.
  const live = patterns.filter((p) => p.active && p.applies_to === "hook").length;

  return (
    <div className="space-y-3 rounded-xl border border-border bg-panel p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-text">
          <BookOpen size={15} />
          Patterns you have studied
        </h2>
        <span className="text-xs text-faint">
          {live > 0 ? `${live} used by Hook Lab` : "none for hooks yet"}
        </span>
      </div>
      <p className="text-sm text-muted">
        When you pull apart someone whose work lands, write down what they
        actually do here. Hook Lab reads the spoken hook ones on top of its
        own eight, and they win where the two disagree. Title and thumbnail
        notes are kept for the tools that will read them.
      </p>

      {error && (
        <p className="flex items-start gap-1.5 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}

      {patterns.length > 0 && (
        <ul className="space-y-2">
          {patterns.map((p) => (
            <li
              key={p.id}
              className={`rounded-lg border p-2.5 ${
                p.active ? "border-border bg-panel-2" : "border-border/50 bg-panel-2/40"
              }`}
            >
              <div className="flex flex-wrap items-start gap-2">
                <span className="min-w-0 flex-1">
                  <span className={`text-sm ${p.active ? "text-text" : "text-faint"}`}>
                    {p.name}
                  </span>
                  <span className="text-xs text-faint">
                    {" "}
                    {APPLIES_LABEL[p.applies_to]}
                    {p.source && ` from ${p.source}`}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">{p.what_it_does}</span>
                  {p.example && (
                    <span className="mt-0.5 block text-xs italic text-faint">{p.example}</span>
                  )}
                </span>
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      start(() => setPatternActiveAction(p.id, !p.active).catch(() => {}))
                    }
                    className={`h-9 rounded-lg border px-2.5 text-[11px] ${
                      p.active ? "border-accent text-accent" : "border-border text-muted"
                    }`}
                  >
                    {p.active ? "In use" : "Off"}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    aria-label={`Remove ${p.name}`}
                    onClick={() => start(() => deletePatternAction(p.id).catch(() => {}))}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted"
                  >
                    <Trash2 size={13} />
                  </button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {open ? (
        <div className="space-y-2 rounded-lg border border-border bg-panel-2 p-2.5">
          {/* Asked first, because it changes what the rest of the form
              is even about. A thumbnail note and a spoken-hook note are
              different crafts. */}
          <div className="flex flex-wrap gap-1.5">
            {APPLIES_TO.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setAppliesTo(w)}
                className={`h-9 rounded-lg border px-3 text-xs ${
                  appliesTo === w
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border text-muted"
                }`}
              >
                {APPLIES_LABEL[w]}
              </button>
            ))}
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="What do you call it?"
            className="w-full rounded-lg border border-border bg-panel px-3 py-2 text-sm text-text outline-none focus:border-accent"
          />
          <input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="Who did you notice it in? (optional)"
            className="w-full rounded-lg border border-border bg-panel px-3 py-2 text-sm text-text outline-none focus:border-accent"
          />
          <div className="flex items-start gap-2">
            <textarea
              value={what}
              onChange={(e) => setWhat(e.target.value)}
              rows={3}
              placeholder="What does it actually do? This is the part the app reads."
              className="min-w-0 flex-1 resize-none rounded-lg border border-border bg-panel px-3 py-2 text-sm text-text outline-none focus:border-accent"
            />
            <MicButton value={what} onChange={setWhat} onError={setError} label="" size="sm" />
          </div>
          <input
            value={example}
            onChange={(e) => setExample(e.target.value)}
            placeholder="One line showing the shape (optional, but it helps a lot)"
            className="w-full rounded-lg border border-border bg-panel px-3 py-2 text-sm text-text outline-none focus:border-accent"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending || !name.trim() || !what.trim()}
              onClick={() =>
                start(async () => {
                  setError(null);
                  try {
                    await addPatternAction({ name, source, whatItDoes: what, example, appliesTo });
                    setName("");
                    setSource("");
                    setWhat("");
                    setExample("");
                    setAppliesTo("hook");
                    setOpen(false);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "That did not save.");
                  }
                })
              }
              className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-accent px-4 text-sm font-medium text-bg disabled:opacity-40"
            >
              <Plus size={15} /> Save pattern
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
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-accent px-3 text-sm text-accent"
        >
          <Plus size={15} /> Add a pattern
        </button>
      )}
    </div>
  );
}
