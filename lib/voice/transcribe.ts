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
  // Priming the model with vocabulary it is about to hear measurably improves
  // how it renders those terms, before any correction pass. The base list is
  // general business and property, since the people using this are not all in
  // the same trade, and the account's own saved terms are appended so a
  // specialist's vocabulary gets primed too.
  form.append("prompt", await buildVocabularyPrompt());

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
 * The vocabulary hint sent to the transcriber.
 *
 * Generic enough to help any small business owner, then extended with
 * whatever terms this particular account has saved, so a lender gets lending
 * words and an agent gets property words without either being hardcoded.
 */
async function buildVocabularyPrompt(): Promise<string> {
  const base =
    "A business owner talking about their work and their customers. " +
    "Terms that may appear: ROI, SEO, CRM, LLC, invoice, retainer, referral, " +
    "escrow, appraisal, listing, closing, commission, contingency, pre-approval, " +
    "underwriting, Realtor, MLS, HOA, APR, FHA, VA, USDA, DSCR, DTI, LTV, PMI, NMLS.";
  try {
    const facts = await getLendingFacts();
    // Capitalised words and acronyms from their own saved facts are exactly
    // the words a general transcriber is most likely to get wrong.
    const terms = Array.from(
      new Set(
        facts
          .flatMap((f) => `${f.fact} ${f.loan_type ?? ""}`.match(/\b[A-Z][A-Za-z0-9-]{1,}\b/g) ?? [])
          .filter((t) => t.length > 1),
      ),
    ).slice(0, 40);
    return terms.length ? `${base} Also: ${terms.join(", ")}.` : base;
  } catch {
    return base;
  }
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
      system: `You correct speech-to-text transcripts of business owners talking about their work.

Your ONLY job is to fix words the transcriber misheard. Typical cases:
- Spelled-out acronyms that should be joined up: "S E O" -> SEO, "F H A" -> FHA, "R O I" -> ROI
- Acronyms heard as words: "in Emma less" -> NMLS, "discer" -> DSCR, "em el es" -> MLS
- Industry words heard phonetically: "ess crow" -> escrow, "contingent see" -> contingency
- Hyphenation of standard terms: "pre approval" -> pre-approval
- Mangled company, product, program or place names

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
