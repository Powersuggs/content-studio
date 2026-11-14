import { NextResponse } from "next/server";
import { generateJson } from "@/lib/ai/generate-json";
import { JSON_ONLY_INSTRUCTION } from "@/lib/ai/signals";
import { getWritingGuardrail, getVerifiedFacts } from "@/lib/queries";
import {
  NEWS_SYSTEM,
  NEWS_SHAPE,
  newsUserPrompt,
  normalizeNews,
  unsourcedFigures,
} from "@/lib/news/prompt";
import { explainDbError } from "@/lib/db-errors";

export const maxDuration = 60;

/**
 * React to something that happened.
 *
 * The figure check at the end does not change the draft. It cannot: the
 * app has no way to tell a legitimate attribution from an invented
 * claim, and stripping a number would mangle the sentence around it. So
 * anything it finds is handed back alongside the draft and shown above
 * it, and he decides. For a licensed lender's public content that is the
 * right division of labour.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const headline = typeof body?.headline === "string" ? body.headline.trim() : "";
    if (headline.length < 8) {
      return NextResponse.json(
        { error: "Say what happened first, even roughly." },
        { status: 400 },
      );
    }

    const input = {
      headline,
      detail: typeof body?.detail === "string" ? body.detail : null,
      source: typeof body?.source === "string" ? body.source : null,
      url: typeof body?.url === "string" ? body.url : null,
      audience: typeof body?.audience === "string" ? body.audience : null,
    };

    const [guardrail, facts] = await Promise.all([
      getWritingGuardrail(),
      getVerifiedFacts().catch(() => []),
    ]);

    const draft = normalizeNews(
      await generateJson({
        system: `${NEWS_SYSTEM}\n\n${guardrail}\n\n${JSON_ONLY_INSTRUCTION}\n\nReturn exactly this shape:\n${NEWS_SHAPE}`,
        user: newsUserPrompt(input),
        maxTokens: 2000,
        useVoice: true,
      }),
    );

    if (!draft) {
      return NextResponse.json(
        { error: "Nothing usable came back. Try again." },
        { status: 502 },
      );
    }

    // His verified facts count as a source: without them, his own checked
    // numbers get flagged and he learns to scroll past the warning, which
    // is worse than not having one.
    const unsourced = unsourcedFigures(draft, [
      input.headline,
      input.detail ?? "",
      ...facts.map((f) => f.fact),
    ]);

    return NextResponse.json({ draft, unsourced });
  } catch (err) {
    const explained = explainDbError(err);
    if (explained) return NextResponse.json({ error: explained }, { status: 503 });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not write that." },
      { status: 500 },
    );
  }
}
