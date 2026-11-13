import { NextResponse } from "next/server";
import { generateJson } from "@/lib/ai/generate-json";
import { JSON_ONLY_INSTRUCTION } from "@/lib/ai/signals";
import { createIdea } from "@/lib/ideas/queries";
import {
  TITLE_SYSTEM,
  titleShape,
  titleUserPrompt,
  normalizeTitle,
  firstWords,
  MIN_TRANSCRIPT_CHARS,
} from "@/lib/talk/prompt";
import { explainDbError } from "@/lib/db-errors";

export const maxDuration = 60;

/**
 * File a spoken take as an idea, with every word of it kept.
 *
 * The transcript is the deliverable here. The title is a convenience, so
 * a failure to produce one must not cost the recording: if the model is
 * unreachable or returns nonsense, the take is still saved under its own
 * opening words. Losing two minutes of talking to a naming step would be
 * the worst possible trade.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const transcript =
      typeof body?.transcript === "string" ? body.transcript.trim() : "";

    if (transcript.length < MIN_TRANSCRIPT_CHARS) {
      return NextResponse.json(
        { error: "That is too short to work from. Talk it through a bit more." },
        { status: 400 },
      );
    }

    let titled: { title: string; angle: string };
    try {
      titled = normalizeTitle(
        await generateJson({
          system: `${TITLE_SYSTEM}\n\n${JSON_ONLY_INSTRUCTION}\n\nReturn exactly this shape:\n${titleShape()}`,
          user: titleUserPrompt(transcript),
          maxTokens: 400,
          useVoice: true,
        }),
        transcript,
      );
    } catch {
      titled = { title: firstWords(transcript), angle: "" };
    }

    const ideaId = await createIdea({
      title: titled.title,
      note: titled.angle || null,
      source: "talk",
      transcript,
    });

    return NextResponse.json({ ideaId, title: titled.title, angle: titled.angle });
  } catch (err) {
    const explained = explainDbError(err);
    if (explained) return NextResponse.json({ error: explained }, { status: 503 });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save that take." },
      { status: 500 },
    );
  }
}
