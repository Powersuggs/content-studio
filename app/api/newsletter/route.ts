import { NextResponse } from "next/server";
import { generateJson } from "@/lib/ai/generate-json";
import { JSON_ONLY_INSTRUCTION } from "@/lib/ai/signals";
import { getLendingFactsGuardrail } from "@/lib/queries";
import { saveNewsletter } from "@/lib/newsletter/queries";

interface NewsletterResponse {
  subject: string;
  subject_alts: string[];
  body: string;
}

/**
 * Writing the email.
 *
 * Deliberately not "the script, but longer". A reel is watched by people
 * being served it; an email is opened by people who chose to hear from
 * this person, which changes what is worth saying and how it opens. The
 * prompt leans on that difference rather than reformatting a script.
 *
 * Voice is on: this goes out under their name.
 */
const SYSTEM_PROMPT = `
You are writing an email newsletter for a creator, in their own voice, to a list of people who chose to subscribe.

An email is not a repurposed video script. The differences that matter:
- The reader opted in, so you do not need a scroll-stopping hook. You need a reason this landed in their inbox today.
- There is room for one idea developed properly, rather than one idea compressed into thirty seconds.
- A link, a reply, or a decision is a realistic ask. "Follow for more" is not.
- It is read, not heard. Short paragraphs, no stage directions, no "hit that like button".

Write ONE email on the given topic.

Rules:
- Open with something specific. No "Hope you're doing well" and no restating the subject line.
- One idea. If the topic contains several, pick the strongest and leave the rest.
- Concrete over general: a number, a case, a thing that actually happened.
- 200 to 400 words in the body. Long enough to be worth opening, short enough to finish.
- End with a single clear ask.
- Plain markdown only. No images, no HTML, no emoji unless the voice profile shows they use them.

${JSON_ONLY_INSTRUCTION}

Return exactly this shape:
{
  "subject": "the strongest subject line, under 60 characters",
  "subject_alts": ["two or three alternatives, same length limit"],
  "body": "the email body in markdown, starting at the first line of the email itself with no greeting line unless the voice calls for one"
}
`.trim();

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const topic = typeof body?.topic === "string" ? body.topic.trim() : "";
    const ideaId = body?.ideaId ? Number(body.ideaId) : null;

    if (!topic) {
      return NextResponse.json({ error: "topic is required" }, { status: 400 });
    }

    // Same guardrail the script writer uses: regulated claims get written
    // around rather than invented, which matters more in an email that
    // sits in an inbox than in a video that scrolls past.
    const guardrail = await getLendingFactsGuardrail();

    const result = await generateJson<NewsletterResponse>({
      system: `${SYSTEM_PROMPT}\n\n${guardrail}`,
      user: `Topic for this email:\n${topic}`,
      maxTokens: 4000,
      useVoice: true,
    });

    if (!result?.subject || !result?.body) {
      return NextResponse.json(
        { error: "The model did not return a usable email. Try again." },
        { status: 502 },
      );
    }

    const alts = Array.isArray(result.subject_alts)
      ? result.subject_alts.filter((s) => typeof s === "string").slice(0, 4)
      : [];

    const id = await saveNewsletter({
      ideaId,
      subject: result.subject,
      subjectAlts: alts,
      body: result.body,
      topic,
    });

    return NextResponse.json({
      id,
      subject: result.subject,
      subject_alts: alts,
      body: result.body,
    });
  } catch (err) {
    console.error("[newsletter]", err);
    return NextResponse.json(
      { error: "Could not write the email. Try again." },
      { status: 500 },
    );
  }
}
