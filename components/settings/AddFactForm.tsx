"use client";

import { useState, useTransition } from "react";
import { BookmarkPlus, Check } from "lucide-react";
import MicButton from "@/components/voice/MicButton";
import { addVerifiedFactAction } from "@/app/settings/actions";

/**
 * Topics offered before the person has typed any of their own.
 *
 * Ordered by what the content is actually about now: recruiting agents
 * and winning transactions first, lending kept because the licence is
 * still live. The box is free text, so this is a nudge rather than a
 * list to pick from.
 */
const DEFAULT_TOPICS = [
  "Agent recruiting",
  "Brokerage / splits",
  "Getting licensed",
  "Buying a home",
  "Selling a home",
  "Local market",
  "Conventional",
  "FHA",
  "VA",
  "USDA",
  "Jumbo",
];

export default function AddFactForm({
  topicSuggestions = [],
}: {
  topicSuggestions?: string[];
}) {
  const [fact, setFact] = useState("");
  const [topic, setTopic] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [saved, setSaved] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const suggestions = Array.from(new Set([...DEFAULT_TOPICS, ...topicSuggestions]));

  const canSubmit = fact.trim().length > 0;

  function save() {
    if (!canSubmit) return;
    startTransition(async () => {
      await addVerifiedFactAction({
        fact: fact.trim(),
        topic: topic.trim(),
        source_name: sourceName.trim(),
        source_url: sourceUrl.trim(),
      });
      setFact("");
      setTopic("");
      setSourceName("");
      setSourceUrl("");
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  }

  return (
    <div className="rounded-xl border border-border bg-panel p-5">
      <p className="text-sm font-medium text-text">Add a verified fact</p>
      <p className="mt-0.5 text-xs text-muted">
        Paste one specific thing you have confirmed is correct, a cost, a split, a cap, a
        requirement, along with where it came from. Every AI writing tool in the app treats
        what is here as ground truth, and is told to write around any specific that is not.
      </p>

      <div className="mt-4 space-y-3">
        <div>
          <label className="text-xs text-faint">Topic</label>
          <input
            list="fact-topic-suggestions"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. Agent recruiting, Getting licensed, VA"
            className="mt-1 w-full rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-text outline-none focus:border-accent"
          />
          <datalist id="fact-topic-suggestions">
            {suggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>

        <div>
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs text-faint">Fact</label>
            <MicButton
              value={fact}
              onChange={setFact}
              onError={setVoiceError}
              label="Read it out"
              size="sm"
            />
          </div>
          <textarea
            value={fact}
            onChange={(e) => setFact(e.target.value)}
            rows={3}
            placeholder="e.g. Arizona pre-licensing is 90 hours plus the 6-hour contract writing course, $650 one time, digital textbook included."
            className="mt-1 w-full resize-none rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-text outline-none focus:border-accent"
          />
          {voiceError && <p className="mt-1 text-xs text-warn">{voiceError}</p>}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs text-faint">Source name</label>
            <input
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
              placeholder="e.g. your broker, the school's price page, VA Lenders Handbook"
              className="mt-1 w-full rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-text outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="text-xs text-faint">Source link (optional)</label>
            <input
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://..."
              className="mt-1 w-full rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-text outline-none focus:border-accent"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={save}
          disabled={isPending || !canSubmit}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg disabled:opacity-50"
        >
          {saved ? <Check size={14} /> : <BookmarkPlus size={14} />}
          {saved ? "Saved" : "Save fact"}
        </button>
      </div>
    </div>
  );
}
