import { query, queryOne } from "@/lib/db";
import { currentAccountId } from "@/lib/auth/current-account";
import { VOICE_QUESTIONS, TOTAL_QUESTIONS } from "./questions";

export interface VoiceAnswer {
  question_key: string;
  answer_text: string;
  source: "typed" | "spoken";
  updated_at: string;
}

export interface VoiceProfile {
  profile_prompt: string | null;
  summary: string | null;
  never_say: string | null;
  posts_analysed: number;
  answers_used: number;
  built_at: string | null;
}

export async function getVoiceAnswers(): Promise<VoiceAnswer[]> {
  return query<VoiceAnswer>(
    `select question_key, answer_text, source, updated_at
     from voice_answers
     where account_id = $1
     order by updated_at asc`,
    [await currentAccountId()],
  );
}

export async function saveVoiceAnswer(input: {
  questionKey: string;
  answerText: string;
  source: "typed" | "spoken";
  rawTranscript?: string | null;
}): Promise<void> {
  const text = input.answerText.trim();
  if (!text) throw new Error("An answer cannot be empty.");
  // Reject a key we do not recognise, so a malformed request cannot fill the
  // table with junk that later gets fed into the synthesis prompt.
  if (!VOICE_QUESTIONS.some((q) => q.key === input.questionKey)) {
    throw new Error(`Unknown question: ${input.questionKey}`);
  }

  await queryOne(
    `insert into voice_answers (account_id, question_key, answer_text, source, raw_transcript)
     values ($1, $2, $3, $4, $5)
     on conflict (account_id, question_key) do update set
       answer_text    = excluded.answer_text,
       source         = excluded.source,
       raw_transcript = excluded.raw_transcript,
       updated_at     = now()
     returning id`,
    [
      await currentAccountId(),
      input.questionKey,
      text,
      input.source,
      input.rawTranscript ?? null,
    ],
  );
}

export async function deleteVoiceAnswer(questionKey: string): Promise<void> {
  await queryOne(
    `delete from voice_answers where account_id = $1 and question_key = $2 returning id`,
    [await currentAccountId(), questionKey],
  );
}

export async function getVoiceProfile(): Promise<VoiceProfile | null> {
  return queryOne<VoiceProfile>(
    `select profile_prompt, summary, never_say, posts_analysed, answers_used, built_at
     from voice_profile
     where account_id = $1`,
    [await currentAccountId()],
  );
}

export async function saveVoiceProfile(input: {
  profilePrompt: string;
  summary: string;
  neverSay: string;
  postsAnalysed: number;
  answersUsed: number;
}): Promise<void> {
  await queryOne(
    `insert into voice_profile
       (account_id, profile_prompt, summary, never_say, posts_analysed, answers_used, built_at)
     values ($1, $2, $3, $4, $5, $6, now())
     on conflict (account_id) do update set
       profile_prompt = excluded.profile_prompt,
       summary        = excluded.summary,
       never_say      = excluded.never_say,
       posts_analysed = excluded.posts_analysed,
       answers_used   = excluded.answers_used,
       built_at       = now(),
       updated_at     = now()
     returning account_id`,
    [
      await currentAccountId(),
      input.profilePrompt,
      input.summary,
      input.neverSay,
      input.postsAnalysed,
      input.answersUsed,
    ],
  );
}

export interface VoiceProgress {
  answered: number;
  total: number;
  isComplete: boolean;
  hasProfile: boolean;
  isStale: boolean;
}

export async function getVoiceProgress(): Promise<VoiceProgress> {
  const [answers, profile] = await Promise.all([getVoiceAnswers(), getVoiceProfile()]);
  const answered = answers.length;
  return {
    answered,
    total: TOTAL_QUESTIONS,
    isComplete: answered >= TOTAL_QUESTIONS,
    hasProfile: Boolean(profile?.profile_prompt),
    // More answers than the profile was built from means it is worth rebuilding.
    isStale: Boolean(profile?.profile_prompt) && answered > (profile?.answers_used ?? 0),
  };
}

/**
 * The block injected into every writing prompt.
 *
 * Returns empty string when there is no profile yet, so every caller can
 * append it unconditionally and the app simply writes in a neutral voice until
 * the interview is done.
 */
export async function getVoicePromptBlock(): Promise<string> {
  const profile = await getVoiceProfile().catch(() => null);
  if (!profile?.profile_prompt) return "";
  return `
VOICE PROFILE -- write as this person, not as an AI assistant:
${profile.profile_prompt}
${profile.never_say ? `\nNEVER write any of the following:\n${profile.never_say}` : ""}
`.trim();
}
