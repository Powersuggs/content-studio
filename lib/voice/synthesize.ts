import { generateJson } from "@/lib/ai/generate-json";
import { query } from "@/lib/db";
import { currentAccountId } from "@/lib/auth/current-account";
import { getVoiceAnswers, saveVoiceProfile } from "./profile";
import { getQuestion, VOICE_SECTIONS } from "./questions";

/** How many of their own posts to show the model as evidence. */
const POST_SAMPLE_SIZE = 60;

interface SynthesisResult {
  profile_prompt: string;
  summary: string;
  never_say: string;
}

const SYSTEM = `
You build a voice profile: a set of instructions that will be prepended to every future writing task so the output sounds like one specific person rather than like an AI.

You get two kinds of evidence:
1. INTERVIEW ANSWERS -- what they say about themselves. Often spoken aloud and transcribed, so expect spoken rhythm, false starts and self-corrections. Those are signal, not noise: they show how the person actually constructs a sentence.
2. THEIR OWN POSTS -- what they actually wrote. This is stronger evidence than anything they claim about themselves, because people are poor witnesses to their own writing. Where the two conflict, trust the posts for HOW they write and the interview for WHAT they believe.

Write the profile as direct second-person instructions to a writer. "You open with a question." Not "The user tends to open with questions."

What makes a profile useful:
- Specific and falsifiable. "Short declarative sentences, rarely over 15 words" beats "concise and punchy".
- Quote their actual phrases. If they say "here's the thing" a lot, say so and quote it.
- Negative instructions carry more weight than positive ones. What they refuse to say defines a voice faster than what they like.
- Capture structure, not just tone: how they open, how they build, how they close, whether they use lists, how they handle a call to action.
- Include who they are talking to and what that person fears, because voice is partly a function of audience.

What ruins a profile:
- Adjectives without evidence. "Authentic, approachable and professional" describes everyone and constrains nothing.
- Flattery. You are writing a specification, not a compliment.
- Inventing traits not present in the evidence. If something was not covered, leave it out.

Return ONLY valid JSON, no preamble, exactly this shape:
{
  "profile_prompt": "The instructions themselves. 300-600 words. This text is injected verbatim into future prompts, so write it to be read by a model, not by a person.",
  "summary": "4-8 sentences, written TO the person, describing what you found about how they write. This is shown back to them so they can disagree with it. Plain and specific.",
  "never_say": "A list, one per line, of words, phrases, claims and moves that must never appear. Draw from what they told you plus anything their posts show they avoid. Include compliance limits if they mentioned any."
}
`.trim();

export async function synthesizeVoiceProfile(): Promise<{
  summary: string;
  answersUsed: number;
  postsAnalysed: number;
}> {
  const answers = await getVoiceAnswers();
  if (answers.length < 5) {
    throw new Error(
      `Only ${answers.length} question${answers.length === 1 ? "" : "s"} answered so far. Answer at least 5 before building the profile.`,
    );
  }

  // Their own writing, which is the stronger evidence. Longest captions
  // first: a two word caption says nothing about how someone writes.
  const posts = await query<{ caption: string }>(
    `select caption
     from posts
     where account_id = $1
       and caption is not null
       and length(caption) > 120
     order by length(caption) desc
     limit $2`,
    [await currentAccountId(), POST_SAMPLE_SIZE],
  );

  const bySection = VOICE_SECTIONS.map((section) => {
    const inSection = answers
      .map((a) => ({ a, q: getQuestion(a.question_key) }))
      .filter((x) => x.q?.section === section);
    if (inSection.length === 0) return null;
    return [
      `## ${section}`,
      ...inSection.map(
        ({ a, q }) =>
          `Q: ${q!.question}\nA (${a.source}): ${a.answer_text}`,
      ),
    ].join("\n\n");
  })
    .filter(Boolean)
    .join("\n\n");

  const postSection = posts.length
    ? `# THEIR OWN POSTS (${posts.length} of them, their actual writing)\n\n${posts
        .map((p, i) => `--- post ${i + 1} ---\n${p.caption}`)
        .join("\n\n")}`
    : "# THEIR OWN POSTS\n\nNone available. Work from the interview alone, and say so in the summary.";

  const result = await generateJson<SynthesisResult>({
    system: SYSTEM,
    user: `# INTERVIEW ANSWERS (${answers.length} of them)\n\n${bySection}\n\n${postSection}`,
    maxTokens: 8000,
  });

  if (!result?.profile_prompt?.trim()) {
    throw new Error("The model returned an empty profile. Try again.");
  }

  await saveVoiceProfile({
    profilePrompt: result.profile_prompt.trim(),
    summary: (result.summary ?? "").trim(),
    neverSay: (result.never_say ?? "").trim(),
    postsAnalysed: posts.length,
    answersUsed: answers.length,
  });

  return {
    summary: result.summary ?? "",
    answersUsed: answers.length,
    postsAnalysed: posts.length,
  };
}
