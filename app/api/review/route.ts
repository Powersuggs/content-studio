import { NextResponse } from "next/server";
import { generateJson } from "@/lib/ai/generate-json";
import { SIGNAL_READING_GUIDE, JSON_ONLY_INSTRUCTION } from "@/lib/ai/signals";
import { getMyPostById, getMyMedianRates, saveReview, type Verdict } from "@/lib/queries";

const VALID_VERDICTS: Verdict[] = ["win", "flop", "ok"];

interface ReviewResponse {
  verdict: string;
  explanation: string;
}

function pct(n: number | null, d: number | null): string {
  if (!n && n !== 0) return "-";
  if (!d) return "-";
  return `${((n / d) * 100).toFixed(1)}%`;
}

const SYSTEM_PROMPT = `
You are a blunt, numbers-first content analyst reviewing a single Instagram post against the creator's own historical medians.

${SIGNAL_READING_GUIDE}

Give a verdict of exactly "win", "flop", or "ok", and a short, blunt explanation (2-4 sentences) that references the SPECIFIC numbers given -- this post's rates vs. the creator's median rates, and watch time if present. Don't hedge. If it's a flop, say why in plain terms. If it's a win, say what to repeat.

${JSON_ONLY_INSTRUCTION}

Return exactly this shape:
{
  "verdict": "win" | "flop" | "ok",
  "explanation": "2-4 blunt sentences citing real numbers"
}
`.trim();

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const postId = Number(body?.postId);
    if (!Number.isFinite(postId)) {
      return NextResponse.json({ error: "postId is required" }, { status: 400 });
    }

    const post = await getMyPostById(postId);
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const medians = await getMyMedianRates();

    const postRates = {
      like_rate: pct(post.likes, post.views),
      comment_rate: pct(post.comments, post.views),
      share_rate: pct(post.shares, post.views),
      save_rate: pct(post.saves, post.views),
      views_to_reach: post.reach ? (post.views / post.reach).toFixed(2) : "-",
      watch_rate:
        post.duration_s && post.avg_watch_s
          ? pct(post.avg_watch_s, post.duration_s)
          : "-",
    };

    const medianRates = {
      like_rate: medians.median_like_rate !== null ? `${(medians.median_like_rate * 100).toFixed(1)}%` : "-",
      comment_rate: medians.median_comment_rate !== null ? `${(medians.median_comment_rate * 100).toFixed(1)}%` : "-",
      share_rate: medians.median_share_rate !== null ? `${(medians.median_share_rate * 100).toFixed(1)}%` : "-",
      save_rate: medians.median_save_rate !== null ? `${(medians.median_save_rate * 100).toFixed(1)}%` : "-",
      views_to_reach: medians.median_views_to_reach !== null ? medians.median_views_to_reach.toFixed(2) : "-",
      watch_rate: medians.median_watch_rate !== null ? `${(medians.median_watch_rate * 100).toFixed(1)}%` : "-",
    };

    const userPrompt = `
This post's raw metrics:
- views: ${post.views}
- reach: ${post.reach}
- likes: ${post.likes}
- comments: ${post.comments}
- shares: ${post.shares}
- saves: ${post.saves}
- duration_s: ${post.duration_s ?? "not tracked"}
- avg_watch_s: ${post.avg_watch_s ?? "not tracked"}
- caption: ${post.caption ?? "(none)"}

This post's rates:
${JSON.stringify(postRates, null, 2)}

My median rates across my own post history (what "normal" looks like for me):
${JSON.stringify(medianRates, null, 2)}
`.trim();

    const result = await generateJson<ReviewResponse>({
      system: SYSTEM_PROMPT,
      user: userPrompt,
      // Small JSON payload (a verdict word + a few sentences), but the
      // budget still needs headroom for the model's internal reasoning.
      maxTokens: 2000,
    });

    const verdict = VALID_VERDICTS.includes(result.verdict as Verdict)
      ? (result.verdict as Verdict)
      : "ok";

    await saveReview(postId, result.explanation, verdict);

    return NextResponse.json({ verdict, explanation: result.explanation });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
