import { NextResponse } from "next/server";
import { generateJson } from "@/lib/ai/generate-json";
import { JSON_ONLY_INSTRUCTION } from "@/lib/ai/signals";
import { transcribeTimed } from "@/lib/clips/transcribe-timed";
import {
  FIND_SYSTEM,
  FIND_SHAPE,
  findUserPrompt,
  validateClips,
} from "@/lib/clips/find";

export const maxDuration = 120;

/**
 * Listen to a take and say which parts stand on their own.
 *
 * Audio only. The browser strips the sound out of the video and sends
 * that, because the picture is the vast majority of the bytes and none
 * of the information: whisper cannot see, and a 25 MB limit that holds
 * an hour of speech holds about forty seconds of video.
 */
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const audio = form.get("audio");
    if (!(audio instanceof Blob)) {
      return NextResponse.json({ error: "No audio arrived." }, { status: 400 });
    }

    const segments = await transcribeTimed(audio);

    const clips = validateClips(
      await generateJson({
        system: `${FIND_SYSTEM}\n\n${JSON_ONLY_INSTRUCTION}\n\nReturn exactly this shape:\n${FIND_SHAPE}`,
        user: findUserPrompt(segments),
        maxTokens: 2000,
        useVoice: true,
      }),
      segments,
    );

    return NextResponse.json({
      clips,
      // Returned so the page can show what it heard. A clip list he
      // disagrees with is much easier to judge against the transcript
      // than against the video alone.
      segments,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not find clips in that." },
      { status: 500 },
    );
  }
}
