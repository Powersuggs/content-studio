import { NextResponse } from "next/server";
import { generateJson } from "@/lib/ai/generate-json";
import { JSON_ONLY_INSTRUCTION } from "@/lib/ai/signals";
import { getWinningPosts, getWritingGuardrail, RATE_FLOOR } from "@/lib/queries";
import { listIdeas } from "@/lib/ideas/queries";
import {
  SUGGEST_SYSTEM,
  suggestUserPrompt,
  suggestShape,
  normalizeSuggestions,
} from "@/lib/ideas/suggest";
import { explainDbError } from "@/lib/db-errors";

export const maxDuration = 60;

const COUNT = 8;

export async function POST() {
  try {
    const winners = await getWinningPosts(15);

    if (winners.length === 0) {
      return NextResponse.json(
        {
          error: `No posts have reached at least ${RATE_FLOOR} people yet, so there is nothing to learn from. Sync your Instagram, or post a few more first.`,
        },
        { status: 409 },
      );
    }

    // The ideas already on the list, so it does not hand back the one he
    // captured this morning. Titles only: a long note on each would crowd
    // out the posts, and the posts are the actual lesson.
    const existing = await listIdeas("all").catch(() => []);
    const alreadyHave = existing.slice(0, 40).map((i) => `- ${i.title}`).join("\n");

    const guardrail = await getWritingGuardrail();

    const result = await generateJson({
      system: `${SUGGEST_SYSTEM}\n\n${guardrail}\n\n${JSON_ONLY_INSTRUCTION}\n\nReturn exactly this shape:\n${suggestShape(COUNT)}`,
      user: alreadyHave
        ? `${suggestUserPrompt(winners, COUNT)}\n\nIdeas already on their list, do not repeat these:\n${alreadyHave}`
        : suggestUserPrompt(winners, COUNT),
      maxTokens: 4000,
      useVoice: true,
    });

    const ideas = normalizeSuggestions(result);
    if (ideas.length === 0) {
      return NextResponse.json(
        { error: "Nothing usable came back. Try again." },
        { status: 502 },
      );
    }

    return NextResponse.json({ ideas, learnedFrom: winners.length });
  } catch (err) {
    const explained = explainDbError(err);
    if (explained) return NextResponse.json({ error: explained }, { status: 503 });
    console.error("idea-suggestions failed", err);
    return NextResponse.json({ error: "Could not suggest ideas." }, { status: 500 });
  }
}
