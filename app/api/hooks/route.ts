import { NextResponse } from "next/server";
import { generateJson } from "@/lib/ai/generate-json";
import { SIGNAL_READING_GUIDE, JSON_ONLY_INSTRUCTION } from "@/lib/ai/signals";
import { getLendingFactsGuardrail } from "@/lib/queries";

const ARCHETYPES = [
  "identity anchor",
  "qualifying question",
  "command with urgency",
  "shared memory",
  "stakes claim",
  "direct dare",
  "contrarian take",
  "curiosity gap",
] as const;

type Archetype = (typeof ARCHETYPES)[number];

interface HookItem {
  archetype: string;
  hook: string;
  rationale: string;
}

interface HooksResponse {
  hooks: HookItem[];
}

const BASE_SYSTEM_PROMPT = `
You write opening hooks (the first spoken line) for short-form video, calibrated by what actually drives retention.

${SIGNAL_READING_GUIDE}
A hook's job is to prevent the early drop-off that shows up as low average watch time.

Write exactly ONE hook per archetype, in this exact order, using these definitions:
1. identity anchor -- names who this is for ("if you're a ___...")
2. qualifying question -- a yes/no question the right viewer answers "yes" to in their head
3. command with urgency -- an imperative that implies a closing window ("stop doing X before...")
4. shared memory -- invokes a common experience the audience will recognize ("remember when...")
5. stakes claim -- states what's at risk if the viewer doesn't know this
6. direct dare -- challenges the viewer to prove something to themselves or others
7. contrarian take -- states a belief that contradicts common wisdom
8. curiosity gap -- withholds a specific piece of information to create an open loop

Each hook should be a single spoken line (under ~20 words), specific to the topic, not generic. Also give a one-line rationale (under ~15 words) explaining WHY that hook works for that archetype on this specific topic.

${JSON_ONLY_INSTRUCTION}

Return exactly this shape:
{
  "hooks": [
    { "archetype": "identity anchor", "hook": "...", "rationale": "..." },
    { "archetype": "qualifying question", "hook": "...", "rationale": "..." },
    { "archetype": "command with urgency", "hook": "...", "rationale": "..." },
    { "archetype": "shared memory", "hook": "...", "rationale": "..." },
    { "archetype": "stakes claim", "hook": "...", "rationale": "..." },
    { "archetype": "direct dare", "hook": "...", "rationale": "..." },
    { "archetype": "contrarian take", "hook": "...", "rationale": "..." },
    { "archetype": "curiosity gap", "hook": "...", "rationale": "..." }
  ]
}
Exactly 8 items, in exactly that order.
`.trim();

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const topic = typeof body?.topic === "string" ? body.topic.trim() : "";
    if (!topic) {
      return NextResponse.json({ error: "topic is required" }, { status: 400 });
    }

    const guardrail = await getLendingFactsGuardrail();
    const result = await generateJson<HooksResponse>({
      system: `${BASE_SYSTEM_PROMPT}\n\n${guardrail}`,
      user: `Topic: ${topic}`,
      // 8 short lines is a small payload, but keep generous headroom for
      // the model's internal thinking pass.
      maxTokens: 4000,
    });

    if (!Array.isArray(result.hooks) || result.hooks.length !== 8) {
      throw new Error(`Expected exactly 8 hooks, got ${result.hooks?.length ?? 0}`);
    }

    // Normalize archetype labels/order defensively in case the model
    // reorders or slightly mis-cases them.
    const byArchetype = new Map(
      result.hooks.map((h) => [h.archetype.trim().toLowerCase(), h]),
    );
    const hooks = ARCHETYPES.map((archetype: Archetype) => ({
      archetype,
      hook: byArchetype.get(archetype)?.hook ?? "",
      rationale: byArchetype.get(archetype)?.rationale ?? "",
    }));

    return NextResponse.json({ hooks });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
