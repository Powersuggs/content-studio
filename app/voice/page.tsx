import VoiceInterview from "@/components/voice/VoiceInterview";
import ProfilePanel from "@/components/voice/ProfilePanel";
import SetupNotice from "@/components/SetupNotice";
import { safeLoad } from "@/lib/db-errors";
import { getVoiceAnswers, getVoiceProfile } from "@/lib/voice/profile";
import { TOTAL_QUESTIONS } from "@/lib/voice/questions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function VoicePage() {
  // The voice tables arrive in a migration, so a database that has not
  // had it run gets a notice naming the file rather than a crash.
  const [answers, answersError] = await safeLoad(
    () => getVoiceAnswers(),
    [] as Awaited<ReturnType<typeof getVoiceAnswers>>,
    "voice_answers",
  );
  const [profile] = await safeLoad(
    () => getVoiceProfile(),
    null as Awaited<ReturnType<typeof getVoiceProfile>>,
    "voice_profile",
  );
  const initial = Object.fromEntries(answers.map((a) => [a.question_key, a.answer_text]));

  if (answersError) {
    return (
      <div className="mx-auto max-w-2xl p-4 md:p-8">
        <SetupNotice message={answersError} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-8">
      <ProfilePanel
        answered={answers.length}
        total={TOTAL_QUESTIONS}
        summary={profile?.summary ?? null}
        neverSay={profile?.never_say ?? null}
        builtAt={profile?.built_at ?? null}
        answersUsed={profile?.answers_used ?? 0}
        postsAnalysed={profile?.posts_analysed ?? 0}
      />
      <VoiceInterview initialAnswers={initial} />
    </div>
  );
}
