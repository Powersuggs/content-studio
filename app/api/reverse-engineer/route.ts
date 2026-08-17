import { NextResponse } from "next/server";
import { generateJson } from "@/lib/ai/generate-json";
import { SIGNAL_READING_GUIDE, JSON_ONLY_INSTRUCTION } from "@/lib/ai/signals";

interface BreakdownResponse {
  hook: string;
  hook_type: string;
  skeleton: string[];
  pacing_notes: string;
  caption_pattern: string;
  why_it_works: string;
  reusable_template: string;
}

const SYSTEM_PROMPT = `
You are an expert short-form video strategist. A creator is reverse-engineering someone ELSE's video (a competitor or inspiration account) so they can understand its structure and reuse the pattern -- not the content -- in their own videos.

${SIGNAL_READING_GUIDE}

You will be given whatever the user was able to paste: some combination of the caption, a transcript of the spoken words, and/or the source URL. Work with what's given. If the transcript is missing, infer the likely hook and structure from the caption and any other context provided, and say so plainly in why_it_works rather than inventing specifics you can't support.

Break the video down into:
1. hook -- the exact opening line (quote it if a transcript was given, otherwise your best reconstruction)
2. hook_type -- the archetype it belongs to (e.g. "identity anchor", "curiosity gap", "contrarian take", "stakes claim", "shared memory", "qualifying question", "command with urgency", "direct dare", or another short label if none fit)
3. skeleton -- an ordered list of 3-6 short structural beats the video moves through (e.g. "Hook states the problem", "Reveal the counter-intuitive fix", "Show proof/example", "Restate the payoff", "CTA"). Keep each beat under ~12 words.
4. pacing_notes -- 1-2 sentences on rhythm/pacing choices worth copying (cuts, text-on-screen, silence, repetition, etc.), grounded only in what's given.
5. caption_pattern -- 1 sentence describing the caption's structural pattern (not its literal content), so it can be reused for a different topic.
6. why_it_works -- 2-3 blunt sentences on the psychological/retention mechanism driving this video, tied to the signals above.
7. reusable_template -- a fill-in-the-blank template (2-4 sentences, with [bracketed] placeholders) the creator could use to write their OWN video following this same skeleton on a different topic.

${JSON_ONLY_INSTRUCTION}

Return exactly this shape:
{
  "hook": "...",
  "hook_type": "...",
  "skeleton": ["...", "..."],
  "pacing_notes": "...",
  "caption_pattern": "...",
  "why_it_works": "...",
  "reusable_template": "..."
}
`.trim();

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const handle = typeof body?.handle === "string" ? body.handle.trim() : "";
    const url = typeof body?.url === "string" ? body.url.trim() : "";
    const caption = typeof body?.caption === "string" ? body.caption.trim() : "";
    const transcript = typeof body?.transcript === "string" ? body.transcript.trim() : "";

    if (!handle) {
      return NextResponse.json({ error: "handle is required" }, { status: 400 });
    }
    if (!caption && !transcript) {
      return NextResponse.json(
        { error: "Paste at least a caption or a transcript to analyze" },
        { status: 400 },
      );
    }

    const userPrompt = `
Creator handle: @${handle}
${url ? `Source URL: ${url}` : "Source URL: (not provided)"}

Caption:
${caption || "(not provided)"}

Transcript:
${transcript || "(not provided -- infer what you reasonably can from the caption alone, and note in why_it_works that this is inferred, not transcribed)"}
`.trim();

    const result = await generateJson<BreakdownResponse>({
      system: SYSTEM_PROMPT,
      user: userPrompt,
      // Skeleton + template is a modest payload, but keep generous
      // headroom for the model's internal thinking pass.
      maxTokens: 4000,
    });

    if (!Array.isArray(result.skeleton) || result.skeleton.length === 0) {
      throw new Error("Model did not return a usable skeleton breakdown");
    }

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
