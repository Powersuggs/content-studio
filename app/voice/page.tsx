import VoiceInterview from "@/components/voice/VoiceInterview";
import ProfilePanel from "@/components/voice/ProfilePanel";
import { getVoiceAnswers, getVoiceProfile } from "@/lib/voice/profile";
import { TOTAL_QUESTIONS } from "@/lib/voice/questions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function VoicePage() {
  const [answers, profile] = await Promise.all([getVoiceAnswers(), getVoiceProfile()]);
  const initial = Object.fromEntries(answers.map((a) => [a.question_key, a.answer_text]));

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
