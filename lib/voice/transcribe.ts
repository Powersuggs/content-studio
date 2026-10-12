import { getAnthropicClient, AI_MODEL, extractResponseText } from "@/lib/ai/client";
import { getLendingFacts } from "@/lib/queries";

const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const GROQ_MODEL = "whisper-large-v3-turbo";

/** Groq's limit. Roughly 100 minutes of spoken-word audio at a sane bitrate. */
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export interface Transcription {
  text: string;
  raw: string;
  corrected: boolean;
}

/**
 * Audio in, clean text out.
 *
 * Two steps, because speech recognition is reliably bad at exactly the words
 * this app cares about. Whisper renders "NMLS" as "in Emma less", "DSCR" as
 * "discer", "escrow" as "ess crow". Left alone those errors end up inside
 * generated content with a licensed lender's name on it.
 *
 * So the transcript goes to Claude with the account's own lending facts as
 * context, with one job: fix mishearings, change nothing else. It is told
 * explicitly not to improve the writing, because the whole point of a spoken
 * answer is how the person actually talks.
 */
export async function transcribeAudio(
  audio: Blob,
  opts: { correctJargon?: boolean } = {},
): Promise<Transcription> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GROQ_API_KEY is not set. Add it in your hosting provider's environment variables.",
    );
  }
  if (audio.size === 0) throw new Error("The recording was empty.");
  if (audio.size > MAX_AUDIO_BYTES) {
    throw new Error(
      `That recording is ${(audio.size / 1024 / 1024).toFixed(1)} MB, over the ${
        MAX_AUDIO_BYTES / 1024 / 1024
      } MB limit. Record a shorter answer.`,
    );
  }

  const form = new FormData();
  form.append("file", audio, "answer.webm");
  form.append("model", GROQ_MODEL);
  form.append("response_format", "json");
  // Priming the model with the vocabulary it is about to hear measurably
  // improves how it renders these terms, before any correction pass.
  form.append(
    "prompt",
    "Mortgage lending conversation. Terms that may appear: NMLS, FHA, VA, USDA, " +
      "conventional, jumbo, DSCR, DTI, LTV, PMI, MIP, escrow, underwriting, " +
      "pre-approval, appraisal, points, APR, amortization, Realtor, eXp.",
  );

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    if (res.status === 401) {
      throw new Error("Groq rejected the API key. Check GROQ_API_KEY is correct.");
    }
    if (res.status === 429) {
      throw new Error("Groq is rate limiting us. Wait a moment and try again.");
    }
    throw new Error(`Transcription failed (${res.status}). ${detail.slice(0, 200)}`);
  }

  const data = (await res.json()) as { text?: string };
  const raw = (data.text ?? "").trim();
  if (!raw) throw new Error("Nothing was heard in that recording.");

  if (opts.correctJargon === false) {
    return { text: raw, raw, corrected: false };
  }

  const text = await correctJargon(raw);
  return { text, raw, corrected: text !== raw };
}

/**
 * Fix misheard industry terms and nothing else.
 *
 * Deliberately narrow. A model asked to "clean up" a transcript will quietly
 * rewrite it into its own voice, which would destroy the thing we are
 * collecting. On any failure we return the original rather than lose the
 * answer: a transcript with "in Emma less" in it beats no transcript.
 */
async function correctJargon(raw: string): Promise<string> {
  try {
    const facts = await getLendingFacts().catch(() => []);
    const factContext = facts.length
      ? `\n\nTerms and programs this person works with, for reference:\n${facts
          .slice(0, 40)
          .map((f) => `- ${f.fact}${f.loan_type ? ` (${f.loan_type})` : ""}`)
          .join("\n")}`
      : "";

    const message = await getAnthropicClient().messages.create({
      model: AI_MODEL,
      max_tokens: 2000,
      system: `You correct speech-to-text transcripts of mortgage and real estate professionals.

Your ONLY job is to fix words the transcriber misheard. Common cases:
- "in Emma less" / "NMLS number" variants -> NMLS
- "discer" / "D S C R" -> DSCR
- "ess crow" -> escrow
- "F H A" -> FHA, "V A" -> VA, "P M I" -> PMI, "D T I" -> DTI, "L T V" -> LTV
- "pre approval" -> pre-approval
- mangled company, program or place names

Rules you must not break:
- Do NOT improve the writing. Keep every filler word, false start, repetition and run-on sentence exactly as spoken.
- Specifically KEEP: "um", "uh", "like", "you know", "I mean", doubled words ("the, the"), and any self-correction ("no, sorry, VA"). These are how the person speaks and they are the reason this transcript exists.
- Do NOT change their word choice, grammar, or sentence structure.
- Do NOT add or remove sentences.
- Do NOT add punctuation beyond what is needed to keep the original sentence boundaries.
- If nothing was misheard, return the text completely unchanged.

The transcript is a record of how this person actually speaks. That is the point of it. Return only the corrected transcript, no preamble.${factContext}`,
      messages: [{ role: "user", content: raw }],
    });

    const corrected = extractResponseText(message).trim();
    // A correction pass that changes the length wildly has done more than it
    // was asked to. Keep the original rather than trust it.
    if (!corrected || Math.abs(corrected.length - raw.length) > raw.length * 0.25) {
      return raw;
    }
    return corrected;
  } catch {
    return raw;
  }
}
