import { MAX_AUDIO_BYTES, buildVocabularyPrompt } from "@/lib/voice/transcribe";
import { normalizeSegments, type TimedSegment } from "./find";
import { getVerifiedFacts } from "@/lib/queries";

const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const GROQ_MODEL = "whisper-large-v3-turbo";

/**
 * The same transcription, but with the clock.
 *
 * The ordinary one asks for plain json and gets a wall of text, which is
 * all a text box needs. Finding clips needs to know WHEN each sentence
 * was said, so this asks for verbose_json instead, which returns
 * segments with times on them.
 *
 * Deliberately a separate function rather than an option on the first
 * one. The returned shapes are different, the failure modes are
 * different, and a shared function with a flag that changes its return
 * type is how both callers end up handling the other one's edge cases.
 *
 * No jargon-correction pass here either: that pass rewrites the text,
 * and rewritten text no longer lines up with the times, which is the
 * only thing this is for. The clip finder works from the rough words and
 * the times, and the words it hands back are only ever used to decide
 * where to cut.
 */
export type { TimedSegment };

export async function transcribeTimed(audio: Blob): Promise<TimedSegment[]> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GROQ_API_KEY is not set. Add it in your hosting provider's environment variables.",
    );
  }
  if (audio.size === 0) throw new Error("That file was empty.");
  if (audio.size > MAX_AUDIO_BYTES) {
    throw new Error(
      `That audio is ${(audio.size / 1024 / 1024).toFixed(1)} MB, over the ${
        MAX_AUDIO_BYTES / 1024 / 1024
      } MB limit. Send a shorter piece of it.`,
    );
  }

  const form = new FormData();
  form.append("file", audio, "take.webm");
  form.append("model", GROQ_MODEL);
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");
  form.append("prompt", await vocabulary());

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`[clips/transcribe] Groq ${res.status}:`, detail.slice(0, 500));
    if (res.status === 401) throw new Error("Groq rejected the API key. Check GROQ_API_KEY.");
    if (res.status === 429) throw new Error("Too many at once. Wait a moment and try again.");
    if (res.status === 413) throw new Error("That file was too long. Try a shorter piece.");
    throw new Error("Could not listen to that just now. Try again.");
  }

  const data = (await res.json()) as {
    segments?: { start?: number; end?: number; text?: string }[];
    text?: string;
    duration?: number;
  };

  const segments = normalizeSegments(data.segments);
  if (segments.length === 0) {
    // A take with words but no segments is a shape we did not expect
    // rather than a silent file, and saying "nothing was heard" would
    // send him off looking at his microphone for no reason.
    if ((data.text ?? "").trim()) {
      throw new Error("The transcriber returned words but no timings. Try again.");
    }
    throw new Error("Nothing was heard in that recording.");
  }
  return segments;
}

async function vocabulary(): Promise<string> {
  try {
    const facts = await getVerifiedFacts();
    const terms = new Set<string>();
    for (const f of facts) {
      if (f.topic?.trim()) terms.add(f.topic.trim());
      for (const word of f.fact.split(/[^A-Za-z0-9.&/-]+/)) {
        if (/^[A-Z][A-Za-z0-9.&/-]{1,}$/.test(word)) terms.add(word);
      }
    }
    return buildVocabularyPrompt([...terms]);
  } catch {
    return buildVocabularyPrompt([]);
  }
}
