import { NextResponse } from "next/server";
import { getAnthropicClient, AI_MODEL, extractResponseText } from "@/lib/ai/client";
import { listPhotos, getPhotoBytes, updatePhoto } from "@/lib/photos/queries";
import { requireAccountId } from "@/lib/auth/current-account";
import { explainDbError } from "@/lib/db-errors";
import { extractJson } from "@/lib/ai/json-extract";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Looks at the photographs and says what they are.
 *
 * Sorting thirty photos by hand is the kind of chore that gets started
 * and not finished, and an unsorted bank is worse than none: the planner
 * trusts the labels, so a headshot filed as a scene gets cropped into a
 * letterbox.
 *
 * Done a few at a time rather than all at once. A request carrying forty
 * images is slow enough to time out, and losing the whole batch to one
 * slow call would mean starting again.
 */
const BATCH = 6;

const SYSTEM = `
You are sorting a creator's photo library so software can place the images on slides.

For each image, decide:

kind: "person" if a human being is a subject of the photograph, even partly, even
from behind, even in a group. Otherwise "scene". When unsure, answer "person":
a scene used where a person was wanted is a dull slide, while a person cropped
into a letterbox is an unusable one, so the cautious answer is "person".

label: a short plain description, 3 to 7 words, of what is actually in the frame.
No adjectives for their own sake. "Man in grey suit, seated" not "Confident
professional exuding success".

tags: 2 to 5 single words or short phrases, comma separated, that someone would
search for. Include the setting and the dominant colour or light where it is
distinctive.

Answer with JSON only, an array in the same order as the images:
[{"kind":"person","label":"...","tags":"..."}]
`.trim();

export async function POST() {
  try {
    await requireAccountId();
    const photos = await listPhotos(300);
    if (photos.length === 0) {
      return NextResponse.json({ sorted: 0, message: "No photos to sort." });
    }

    const client = getAnthropicClient();
    let sorted = 0;

    for (let i = 0; i < photos.length; i += BATCH) {
      const batch = photos.slice(i, i + BATCH);
      const loaded = await Promise.all(
        batch.map(async (p) => ({ photo: p, data: await getPhotoBytes(p.id) })),
      );
      const usable = loaded.filter(
        (x): x is { photo: (typeof batch)[number]; data: NonNullable<typeof x.data> } =>
          x.data !== null,
      );
      if (usable.length === 0) continue;

      const message = await client.messages.create({
        model: AI_MODEL,
        max_tokens: 2000,
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              ...usable.map((x) => ({
                type: "image" as const,
                source: {
                  type: "base64" as const,
                  media_type: x.data.mime as "image/jpeg" | "image/png" | "image/webp",
                  data: x.data.bytes.toString("base64"),
                },
              })),
              {
                type: "text" as const,
                text: `Sort these ${usable.length} images, in order.`,
              },
            ],
          },
        ],
      });

      const parsed = extractJson<{ kind?: string; label?: string; tags?: string }[]>(
        extractResponseText(message),
      );
      if (!Array.isArray(parsed)) continue;

      for (const [j, result] of parsed.entries()) {
        const target = usable[j];
        if (!target) break;
        await updatePhoto(target.photo.id, {
          kind: result?.kind === "person" ? "person" : "scene",
          label: typeof result?.label === "string" ? result.label.slice(0, 120) : null,
          tags: typeof result?.tags === "string" ? result.tags.slice(0, 200) : null,
        });
        sorted++;
      }
    }

    return NextResponse.json({ sorted, total: photos.length });
  } catch (err) {
    console.error("[photos/classify]", err);
    const setup = explainDbError(err);
    if (setup) return NextResponse.json({ error: setup }, { status: 503 });
    return NextResponse.json(
      { error: "Could not sort the photos just now. Try again." },
      { status: 500 },
    );
  }
}
