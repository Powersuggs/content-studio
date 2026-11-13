import { NextResponse } from "next/server";
import { generateJson } from "@/lib/ai/generate-json";
import { JSON_ONLY_INSTRUCTION } from "@/lib/ai/signals";
import { getWritingGuardrail } from "@/lib/queries";
import {
  getChapterForDrafting,
  getOwnMaterial,
  saveChapterBody,
} from "@/lib/books/queries";
import {
  CHAPTER_SYSTEM,
  CHAPTER_SHAPE,
  chapterUserPrompt,
  normalizeChapter,
} from "@/lib/books/prompts";
import { explainDbError } from "@/lib/db-errors";

export const maxDuration = 120;

/**
 * Draft one chapter.
 *
 * It is given the rest of the outline as well as its own summary, which
 * is the difference between a chapter and a blog post on the same
 * subject: without it, chapter four re-explains what chapter two was for.
 */
export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({}));
    const chapterId = Number(payload?.chapterId);
    if (!Number.isInteger(chapterId) || chapterId < 1) {
      return NextResponse.json({ error: "Which chapter?" }, { status: 400 });
    }

    const found = await getChapterForDrafting(chapterId);
    if (!found) {
      return NextResponse.json({ error: "That chapter is not there." }, { status: 404 });
    }
    const { chapter, book, outline } = found;

    const [guardrail, material] = await Promise.all([
      getWritingGuardrail(),
      getOwnMaterial().catch(() => []),
    ]);

    const result = normalizeChapter(
      await generateJson({
        system: `${CHAPTER_SYSTEM}\n\n${guardrail}\n\n${JSON_ONLY_INSTRUCTION}\n\nReturn exactly this shape:\n${CHAPTER_SHAPE}`,
        user: chapterUserPrompt({ book, chapter, outline, material }),
        maxTokens: 8000,
        useVoice: true,
      }),
    );

    if (!result) {
      return NextResponse.json(
        { error: "Nothing usable came back. Try again." },
        { status: 502 },
      );
    }

    await saveChapterBody(chapterId, result.body);
    return NextResponse.json({ notes: result.notes });
  } catch (err) {
    const explained = explainDbError(err);
    if (explained) return NextResponse.json({ error: explained }, { status: 503 });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not write that chapter." },
      { status: 500 },
    );
  }
}
