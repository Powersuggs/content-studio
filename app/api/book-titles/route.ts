import { NextResponse } from "next/server";
import { generateJson } from "@/lib/ai/generate-json";
import { JSON_ONLY_INSTRUCTION } from "@/lib/ai/signals";
import { getWritingGuardrail } from "@/lib/queries";
import { getBook, getOwnMaterial } from "@/lib/books/queries";
import { listPatterns } from "@/lib/hooks/patterns";
import { renderPatterns } from "@/lib/hooks/render";
import {
  TITLES_SYSTEM,
  TITLES_SHAPE,
  titlesUserPrompt,
  normalizeTitles,
} from "@/lib/books/titles";
import { explainDbError } from "@/lib/db-errors";

export const maxDuration = 60;

/**
 * Suggest titles and subtitles from what the book argues.
 *
 * Takes either a bookId or a premise typed straight in, because the moment
 * he most wants this is before the book exists: he is sitting on the Start
 * a book form with an idea and no name for it. Requiring the book to be
 * created first would mean every book gets created under a placeholder
 * title, which is how a book ends up permanently called "Untitled".
 *
 * A premise is the one thing it will not proceed without. Titles invented
 * from an audience alone are six ways of saying nothing.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));

    let premise = typeof body?.premise === "string" ? body.premise.trim() : "";
    let audience = typeof body?.audience === "string" ? body.audience.trim() : "";
    let currentTitle = typeof body?.title === "string" ? body.title.trim() : "";

    // An existing book is the source of truth over anything posted with it.
    const bookId = Number(body?.bookId);
    if (Number.isInteger(bookId) && bookId > 0) {
      const book = await getBook(bookId);
      if (!book) {
        return NextResponse.json({ error: "That book is not there." }, { status: 404 });
      }
      premise = book.premise?.trim() || premise;
      audience = book.audience?.trim() || audience;
      currentTitle = book.title?.trim() || currentTitle;
    }

    if (!premise) {
      return NextResponse.json(
        {
          error:
            "Say what the book argues first. A title written from nothing is six ways of saying nothing.",
        },
        { status: 400 },
      );
    }

    // Anything he has written down about how book titles work beats the
    // rules baked into TITLES_SYSTEM, because those are my reading of two
    // book covers and his are what he actually watched someone teach.
    const [guardrail, material, studied] = await Promise.all([
      getWritingGuardrail(),
      getOwnMaterial().catch(() => []),
      listPatterns()
        .then((p) => renderPatterns(p, "book_title"))
        .catch(() => ""),
    ]);

    const ideas = normalizeTitles(
      await generateJson({
        system: [
          TITLES_SYSTEM,
          studied,
          guardrail,
          `${JSON_ONLY_INSTRUCTION}\n\nReturn exactly this shape:\n${TITLES_SHAPE}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
        user: titlesUserPrompt({ premise, audience, currentTitle, material }),
        maxTokens: 3000,
        useVoice: true,
      }),
    );

    if (ideas.length === 0) {
      return NextResponse.json(
        { error: "Nothing usable came back. Try again." },
        { status: 502 },
      );
    }

    return NextResponse.json({ ideas });
  } catch (err) {
    const explained = explainDbError(err);
    if (explained) return NextResponse.json({ error: explained }, { status: 503 });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not suggest titles." },
      { status: 500 },
    );
  }
}
