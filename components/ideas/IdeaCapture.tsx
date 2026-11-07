"use client";

import { useState, useTransition } from "react";
import { Lightbulb, Check } from "lucide-react";
import { createIdeaAction } from "@/app/ideas/actions";
import MicButton from "@/components/voice/MicButton";

/**
 * Catching an idea.
 *
 * Deliberately one box and one button. An idea you have to fill in a form
 * to record is an idea you do not record, and the whole point of the
 * pipeline is to catch the half-formed ones before they evaporate. The
 * detail can be added later, or never.
 *
 * Which is also why the microphone is here. Typing is the slowest way to
 * catch a thought, and an idea said out loud lands in the box in the words
 * it was actually thought in, which is the voice everything downstream is
 * trying to reproduce.
 */
export default function IdeaCapture() {
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [saved, setSaved] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const canSave = title.trim().length > 0;

  function save() {
    if (!canSave) return;
    startTransition(async () => {
      await createIdeaAction({ title: title.trim(), note: note.trim() });
      setTitle("");
      setNote("");
      setShowNote(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    });
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-panel p-4">
      <div className="flex items-center gap-2">
        <Lightbulb size={18} strokeWidth={1.75} className="text-accent" />
        <h2 className="text-sm font-semibold text-text">Capture an idea</h2>
      </div>

      <div className="flex flex-wrap items-start gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              save();
            }
          }}
          placeholder="Say it the way you'd say it out loud"
          className="min-w-0 flex-1 rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-text outline-none placeholder:text-faint focus:border-accent"
        />
        <MicButton value={title} onChange={setTitle} onError={setVoiceError} />
        <button
          type="button"
          onClick={save}
          disabled={!canSave || isPending}
          className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-bg disabled:opacity-50"
        >
          {saved ? (
            <span className="flex items-center gap-1">
              <Check size={14} /> Saved
            </span>
          ) : isPending ? (
            "Saving"
          ) : (
            "Add"
          )}
        </button>
      </div>

      {voiceError && <p className="text-xs text-warn">{voiceError}</p>}

      {showNote ? (
        <div className="space-y-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="The angle, who it's for, what set you off. Optional."
            className="w-full rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-text outline-none placeholder:text-faint focus:border-accent"
          />
          <MicButton
            value={note}
            onChange={setNote}
            onError={setVoiceError}
            label="Speak the note"
            size="sm"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowNote(true)}
          className="text-xs text-faint hover:text-accent"
        >
          Add a note
        </button>
      )}
    </div>
  );
}
