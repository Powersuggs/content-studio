import VoiceInterview from "@/components/voice/VoiceInterview";
import { getVoiceAnswers } from "@/lib/voice/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function VoicePage() {
  const answers = await getVoiceAnswers();
  const initial = Object.fromEntries(answers.map((a) => [a.question_key, a.answer_text]));
  return <VoiceInterview initialAnswers={initial} />;
}
