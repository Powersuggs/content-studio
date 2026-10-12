import { NextResponse } from "next/server";
import { transcribeAudio, MAX_AUDIO_BYTES } from "@/lib/voice/transcribe";
import { requireAccountId } from "@/lib/auth/current-account";

export const runtime = "nodejs";
// Transcription plus the correction pass. A two minute answer is well inside
// this; the ceiling is here so a stuck request fails rather than hangs.
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    await requireAccountId();

    const form = await request.formData();
    const file = form.get("audio");
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "No audio was sent." }, { status: 400 });
    }
    if (file.size > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        { error: "That recording is too long. Try a shorter answer." },
        { status: 413 },
      );
    }

    const result = await transcribeAudio(file);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transcription failed.";
    console.error("[voice/transcribe]", err);
    // These messages are shown to the person, so they say what to do rather
    // than naming internals.
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
