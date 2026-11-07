import { getAnthropicClient, AI_MODEL, extractResponseText } from "@/lib/ai/client";
import { getVerifiedFacts } from "@/lib/queries";

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
 * So the transcript goes to Claude with the account's own verified facts as
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
  form.append("prompt", await vocabularyPrompt());

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    // The detail is a JSON envelope. It belongs in the log, where it is
    // useful, not pasted under a text box, where it is frightening and
    // tells the person nothing they can act on.
    console.error(`[voice/transcribe] Groq ${res.status}:`, detail.slice(0, 500));

    if (res.status === 401) {
      throw new Error("Groq rejected the API key. Check GROQ_API_KEY is correct.");
    }
    if (res.status === 429) {
      throw new Error("Too many recordings at once. Wait a moment and try again.");
    }
    if (res.status === 413) {
      throw new Error("That recording was too long. Try again in shorter pieces.");
    }
    if (res.status === 400) {
      throw new Error(
        "The transcriber refused that recording. Try again, and if it keeps happening, type it instead.",
      );
    }
    throw new Error("Could not write that down just now. Try again, or type it instead.");
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
 * Groq's hard ceiling on the vocabulary hint. Sending one character more
 * is rejected outright with invalid_prompt, which fails the whole
 * transcription, so this is a limit to build under rather than discover.
 */
export const MAX_VOCAB_PROMPT_CHARS = 896;

/**
 * The generic half of the hint: words any small business owner in property
 * or lending is likely to say. Kept deliberately short, because the other
 * half is the account's own vocabulary and that is the more valuable of the
 * two. Those are the words a general transcriber has never seen.
 *
 * "eXp" is heard as "expe" and "ICA" as "I see A" without a hint, and those
 * words carry the meaning in a recruiting script.
 */
const BASE_VOCAB =
  "A business owner talking about property, lending and recruiting. " +
  "Terms that may appear: ROI, SEO, CRM, LLC, referral, escrow, appraisal, " +
  "listing, closing, commission, contingency, pre-approval, underwriting, " +
  "Realtor, MLS, HOA, APR, FHA, VA, USDA, DSCR, DTI, LTV, PMI, NMLS, eXp, " +
  "eXp Realty, brokerage, broker, sponsor, revenue share, commission split, " +
  "cap, transaction fee, ICA, pre-licensing, licensure, designated broker, " +
  "GCI, listing agreement.";

/**
 * Assemble the hint, never exceeding the ceiling.
 *
 * Terms are added one at a time while they fit rather than sliced to a
 * fixed count. A fixed count was the bug: forty terms is a different
 * number of characters for every account, and an account with a full facts
 * library silently pushed the hint past the limit, which failed every
 * transcription in the app rather than merely hinting less well.
 *
 * Pure and exported so its length can be asserted in a test without a
 * database or a network call.
 */
export function buildVocabularyPrompt(accountTerms: string[]): string {
  const prefix = " Also: ";
  let out = BASE_VOCAB;
  const added: string[] = [];

  for (const term of accountTerms) {
    const candidate = `${BASE_VOCAB}${prefix}${[...added, term].join(", ")}.`;
    if (candidate.length > MAX_VOCAB_PROMPT_CHARS) break;
    added.push(term);
  }

  if (added.length) out = `${BASE_VOCAB}${prefix}${added.join(", ")}.`;

  // Belt and braces. BASE_VOCAB alone is well under the ceiling today, but
  // a future edit to it should degrade the hint rather than break every
  // recording in the app.
  return out.length > MAX_VOCAB_PROMPT_CHARS
    ? out.slice(0, MAX_VOCAB_PROMPT_CHARS)
    : out;
}

/**
 * Words that start a sentence rather than name anything.
 *
 * The extraction below takes capitalised words, which catches every
 * acronym and proper noun worth hinting, and also catches "The", "On" and
 * "No" at the start of a sentence. Those cost characters out of a budget
 * that is already tight and teach the transcriber nothing: it has never
 * struggled with the word "the".
 */
const SENTENCE_STARTERS = new Set(
  (
    "a an and are all any as at be because been before both but by can could did do does " +
    "each every for from had has have how if in into is it its just keep like make may " +
    "more most must need never new no not now of on once one only or other our out over " +
    "per put same see should since so some than that the their them then there these " +
    "they this those to up use very was we were what when where which while who will " +
    "with would you your"
  ).split(" "),
);

/**
 * The account's own words, most likely to be misheard first.
 *
 * Capitalised words and acronyms out of their saved facts are exactly what
 * a general transcriber gets wrong, and they are specific to the trade this
 * person is actually in. Ordinary words that merely happened to start a
 * sentence are dropped, so the limited room goes to terms that earn it.
 */
export function extractAccountTerms(
  facts: { fact: string; topic: string | null }[],
): string[] {
  return Array.from(
    new Set(
      facts
        .flatMap(
          (f) => `${f.fact} ${f.topic ?? ""}`.match(/\b[A-Z][A-Za-z0-9-]{1,}\b/g) ?? [],
        )
        .filter((t) => t.length > 1 && !SENTENCE_STARTERS.has(t.toLowerCase())),
    ),
  );
}

async function vocabularyPrompt(): Promise<string> {
  try {
    return buildVocabularyPrompt(extractAccountTerms(await getVerifiedFacts()));
  } catch {
    return BASE_VOCAB;
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
    const facts = await getVerifiedFacts().catch(() => []);
    const factContext = facts.length
      ? `\n\nTerms and programs this person works with, for reference:\n${facts
          .slice(0, 40)
          .map((f) => `- ${f.fact}${f.topic ? ` (${f.topic})` : ""}`)
          .join("\n")}`
      : "";

    const message = await getAnthropicClient().messages.create({
      model: AI_MODEL,
      max_tokens: 2000,
      system: `You correct speech-to-text transcripts of business owners talking about their work.

Your ONLY job is to fix words the transcriber misheard. Typical cases:
- Spelled-out acronyms that should be joined up: "S E O" -> SEO, "F H A" -> FHA, "R O I" -> ROI
- Acronyms heard as words: "in Emma less" -> NMLS, "discer" -> DSCR, "em el es" -> MLS, "I see A" -> ICA
- Industry words heard phonetically: "ess crow" -> escrow, "contingent see" -> contingency
- Brokerage names and recruiting terms: "expe" / "ex pee" / "X P" -> eXp, "rev share" kept as-is, "G C I" -> GCI
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
