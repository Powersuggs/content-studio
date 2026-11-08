import { NextResponse } from "next/server";
import { generateJson } from "@/lib/ai/generate-json";
import { JSON_ONLY_INSTRUCTION } from "@/lib/ai/signals";
import { getWritingGuardrail, saveScript } from "@/lib/queries";
import { saveNewsletter } from "@/lib/newsletter/queries";
import { getIdeaForGeneration, saveDraft } from "@/lib/ideas/queries";
import { isFormatId, formatLabel } from "@/lib/ideas/formats";
import { systemPromptFor, maxTokensFor, normalize } from "@/lib/ideas/generate";
import { explainDbError } from "@/lib/db-errors";

export const maxDuration = 60;

/**
 * Turn one idea into one format.
 *
 * The format chips on an idea used to be a tick: "I made this elsewhere."
 * Pressing one now writes the thing. The row that records the format is
 * the row that holds the draft, so ticking and having are the same state
 * and cannot drift apart.
 *
 * Two formats also get a real home outside the idea, because they already
 * have one and splitting them would mean two copies going stale:
 * an email becomes a newsletter so it appears on the Newsletter page, and
 * a reel or short becomes a script so it reaches Session Mode.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const ideaId = Number(body?.ideaId);
    const format = String(body?.format ?? "");

    if (!Number.isInteger(ideaId) || ideaId < 1) {
      return NextResponse.json({ error: "Which idea?" }, { status: 400 });
    }
    if (!isFormatId(format)) {
      return NextResponse.json({ error: `Unknown format: ${format}` }, { status: 400 });
    }

    const idea = await getIdeaForGeneration(ideaId);
    if (!idea) {
      return NextResponse.json({ error: "That idea is not there." }, { status: 404 });
    }

    const guardrail = await getWritingGuardrail();

    const result = normalize(
      await generateJson({
        system: `${systemPromptFor(format, JSON_ONLY_INSTRUCTION)}\n\n${guardrail}`,
        user: idea.note
          ? `The idea:\n${idea.title}\n\nTheir note on it:\n${idea.note}`
          : `The idea:\n${idea.title}`,
        maxTokens: maxTokensFor(format),
        useVoice: true,
      }),
    );

    if (!result) {
      return NextResponse.json(
        { error: `Could not write the ${formatLabel(format).toLowerCase()}. Try again.` },
        { status: 502 },
      );
    }

    // Give it its proper home first, so the id can be stored alongside the
    // draft in one write rather than left dangling if the second fails.
    let scriptId: number | null = null;
    let newsletterId: number | null = null;

    if (format === "reel" || format === "short") {
      const saved = await saveScript({
        postId: null,
        title: idea.title.slice(0, 200),
        hook: result.title,
        body: result.body || result.parts.join("\n\n"),
      });
      scriptId = saved.id;
    } else if (format === "email") {
      newsletterId = await saveNewsletter({
        ideaId: idea.id,
        subject: result.title,
        subjectAlts: [],
        body: result.body || result.parts.join("\n\n"),
        topic: idea.title,
      });
    }

    await saveDraft({ ideaId, format, content: result, scriptId, newsletterId });

    return NextResponse.json({ format, content: result, scriptId, newsletterId });
  } catch (err) {
    console.error("[idea-output]", err);
    const setup = explainDbError(err);
    if (setup) return NextResponse.json({ error: setup }, { status: 503 });
    return NextResponse.json(
      { error: "Could not write that just now. Try again." },
      { status: 500 },
    );
  }
}
