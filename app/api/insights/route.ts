import { NextResponse } from "next/server";
import { generateJson } from "@/lib/ai/generate-json";
import { SIGNAL_READING_GUIDE, JSON_ONLY_INSTRUCTION } from "@/lib/ai/signals";
import { buildPostsTable } from "@/lib/ai/posts-table";
import { getPostsForAnalysis, replaceInsights, type InsightKind } from "@/lib/queries";

const VALID_KINDS: InsightKind[] = ["win", "warning", "idea"];

interface RawPattern {
  kind: string;
  title: string;
  body: string;
  metric: string;
}

interface InsightsResponse {
  patterns: RawPattern[];
}

const SYSTEM_PROMPT = `
You are a blunt, numbers-first content analyst reviewing someone's own Instagram post history.

${SIGNAL_READING_GUIDE}

Find exactly FOUR patterns across the whole post history -- not summaries of individual posts, but trends that show up across multiple posts. Mix the kinds: some should be wins (things working, worth doing more of), some warnings (things quietly hurting performance), some ideas (untested opportunities implied by the data).

${JSON_ONLY_INSTRUCTION}

Return exactly this shape:
{
  "patterns": [
    {
      "kind": "win" | "warning" | "idea",
      "title": "short label, under 8 words",
      "body": "1-3 sentences explaining the pattern, citing REAL numbers from the table (specific post ids, percentages, counts -- never vague language like 'several posts')",
      "metric": "a single quantified headline metric for this pattern, e.g. '+38% save rate' or '4 of last 6 posts'"
    }
  ]
}
Exactly 4 items in "patterns", no more, no fewer.
`.trim();

export async function POST() {
  try {
    const posts = await getPostsForAnalysis();
    if (posts.length === 0) {
      return NextResponse.json(
        { error: "No posts found for your handle yet." },
        { status: 400 },
      );
    }

    const table = buildPostsTable(posts);
    const userPrompt = `Here is my post history (own posts only), one row per post:\n\n${table}`;

    // Token budget set well above the ~4-item JSON payload we expect --
    // reasoning models spend part of max_tokens on internal thinking
    // before they emit the JSON itself. This route's input can run up to
    // 300 rows of post data (see getPostsForAnalysis), which takes a lot
    // more thinking to find cross-post patterns in than the other AI
    // routes' much smaller inputs -- 4000 wasn't enough headroom once a
    // real account's history filled that table in, so this needs a
    // bigger budget than the others.
    const result = await generateJson<InsightsResponse>({
      system: SYSTEM_PROMPT,
      user: userPrompt,
      maxTokens: 10000,
    });

    if (!Array.isArray(result.patterns) || result.patterns.length !== 4) {
      throw new Error(
        `Expected exactly 4 patterns, got ${result.patterns?.length ?? 0}`,
      );
    }

    const patterns = result.patterns.map((p) => {
      const kind = VALID_KINDS.includes(p.kind as InsightKind)
        ? (p.kind as InsightKind)
        : "idea";
      const content = `${p.title} — ${p.metric}\n${p.body}`;
      return { kind, content };
    });

    await replaceInsights(patterns);

    return NextResponse.json({ patterns });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
