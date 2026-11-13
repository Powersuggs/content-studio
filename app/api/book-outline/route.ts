import { NextResponse } from "next/server";
import { generateJson } from "@/lib/ai/generate-json";
import { JSON_ONLY_INSTRUCTION } from "@/lib/ai/signals";
import { getWritingGuardrail } from "@/lib/queries";
import { getBook, getOwnMaterial, replaceOutline } from "@/lib/books/queries";
import {
  OUTLINE_SYSTEM,
  OUTLINE_SHAPE,
  outlineUserPrompt,
  normalizeOutline,
} from "@/lib/books/prompts";
import { explainDbError } from "@/lib/db-errors";

export const maxDuration = 60;

/**
 * Outline a book from its premise and his own material.
 *
 * Re-running this is safe by construction: replaceOutline keeps every
 * chapter that already has prose in it. The button has to stay pressable
 * after he has started writing, because an outline he cannot revise is
 * an outline he will abandon the book over.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const bookId = Number(body?.bookId);
    if (!Number.isInteger(bookId) || bookId < 1) {
      return NextResponse.json({ error: "Which book?" }, { status: 400 });
    }

    const book = await getBook(bookId);
    if (!book) return NextResponse.json({ error: "That book is not there." }, { status: 404 });
    if (!book.premise?.trim()) {
      return NextResponse.json(
        { error: "Say what the book argues first. Without that an outline is guesswork." },
        { status: 400 },
      );
    }

    const [guardrail, material] = await Promise.all([
      getWritingGuardrail(),
      getOwnMaterial().catch(() => []),
    ]);

    const chapters = normalizeOutline(
      await generateJson({
        system: `${OUTLINE_SYSTEM}\n\n${guardrail}\n\n${JSON_ONLY_INSTRUCTION}\n\nReturn exactly this shape:\n${OUTLINE_SHAPE}`,
        user: outlineUserPrompt({ ...book, material }),
        maxTokens: 4000,
        useVoice: true,
      }),
    );

    if (chapters.length === 0) {
      return NextResponse.json(
        { error: "Nothing usable came back. Try again." },
        { status: 502 },
      );
    }

    const { added, kept } = await replaceOutline(bookId, chapters);
    return NextResponse.json({ added, kept });
  } catch (err) {
    const explained = explainDbError(err);
    if (explained) return NextResponse.json({ error: explained }, { status: 503 });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not outline that." },
      { status: 500 },
    );
  }
}
