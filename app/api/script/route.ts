import { NextResponse } from "next/server";
import { generateJson } from "@/lib/ai/generate-json";
import { SIGNAL_READING_GUIDE, JSON_ONLY_INSTRUCTION } from "@/lib/ai/signals";
import { getMyPostById, saveScript, getLendingFactsGuardrail } from "@/lib/queries";

interface ScriptResponse {
  hook: string;
  script: string;
  caption: string;
  notes: string;
}

const BASE_SYSTEM_PROMPT = `
You are a scriptwriter for short-form video, working from a creator's own performance data.

${SIGNAL_READING_GUIDE}

Write a complete short-form video script for the given topic. If an example post is provided, model the structure, pacing, and voice on what worked in that post -- but write NEW content for the new topic, don't just reword the example.

${JSON_ONLY_INSTRUCTION}

Return exactly this shape:
{
  "hook": "the first 1-2 spoken lines, written to be said on camera",
  "script": "the full script body after the hook, written to be said on camera, using line breaks between beats",
  "caption": "a caption to post alongside the video",
  "notes": "1-3 sentences of production notes: pacing, what to show on screen, or why this structure was chosen"
}
`.trim();

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const topic = typeof body?.topic === "string" ? body.topic.trim() : "";
    if (!topic) {
      return NextResponse.json({ error: "topic is required" }, { status: 400 });
    }

    const modelPostId = body?.modelPostId ? Number(body.modelPostId) : null;
    let modelPostSection = "No example post provided -- write from the topic alone.";
    let resolvedModelPostId: number | null = null;

    if (modelPostId) {
      const modelPost = await getMyPostById(modelPostId);
      if (!modelPost) {
        return NextResponse.json(
          { error: "modelPostId not found for your handle" },
          { status: 404 },
        );
      }
      resolvedModelPostId = modelPost.id;
      const watchRate =
        modelPost.duration_s && modelPost.avg_watch_s
          ? `${((modelPost.avg_watch_s / modelPost.duration_s) * 100).toFixed(1)}%`
          : "not tracked";
      modelPostSection = `
Model the new script's structure and pacing on this existing post of mine:
- caption: ${modelPost.caption ?? "(none)"}
- existing script (if any): ${modelPost.script ?? "(not stored)"}
- views: ${modelPost.views}, reach: ${modelPost.reach}, likes: ${modelPost.likes}, comments: ${modelPost.comments}, shares: ${modelPost.shares}, saves: ${modelPost.saves}
- duration_s: ${modelPost.duration_s ?? "not tracked"}, avg_watch_s: ${modelPost.avg_watch_s ?? "not tracked"}, watch_rate: ${watchRate}
`.trim();
    }

    const userPrompt = `
Topic: ${topic}

${modelPostSection}
`.trim();

    const guardrail = await getLendingFactsGuardrail();
    const result = await generateJson<ScriptResponse>({
      system: `${BASE_SYSTEM_PROMPT}\n\n${guardrail}`,
      user: userPrompt,
      // Scripts run longer than the other JSON payloads, so this needs
      // the largest budget of the four routes plus thinking headroom.
      maxTokens: 6000,
    });

    const saved = await saveScript({
      postId: resolvedModelPostId,
      title: topic,
      hook: result.hook,
      body: JSON.stringify({ script: result.script, caption: result.caption, notes: result.notes }),
    });

    return NextResponse.json({ id: saved.id, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
