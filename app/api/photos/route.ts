import { NextResponse } from "next/server";
import { savePhoto } from "@/lib/photos/queries";
import { requireAccountId } from "@/lib/auth/current-account";
import { explainDbError } from "@/lib/db-errors";

export const runtime = "nodejs";

/**
 * Hard ceiling on what will be accepted.
 *
 * The browser downscales before sending, so anything arriving near this
 * has skipped that step. Serverless request bodies are capped well below
 * what a phone photo weighs, and a rejection with a reason beats a
 * request that dies halfway with no explanation.
 */
const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request) {
  try {
    await requireAccountId();

    const form = await request.formData();
    const file = form.get("photo");
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "No photo was sent." }, { status: 400 });
    }
    if (!ALLOWED.has(file.type)) {
      return NextResponse.json(
        { error: `That is a ${file.type || "unknown"} file. Use a JPEG, PNG or WebP.` },
        { status: 415 },
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        {
          error: `That photo is ${(file.size / 1024 / 1024).toFixed(1)} MB, over the ${
            MAX_BYTES / 1024 / 1024
          } MB limit. It should have been shrunk before sending, so try a different one.`,
        },
        { status: 413 },
      );
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "That file was empty." }, { status: 400 });
    }

    const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : null);
    const num = (v: FormDataEntryValue | null) => {
      const n = Number(typeof v === "string" ? v : NaN);
      return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
    };

    const id = await savePhoto({
      label: str(form.get("label")),
      tags: str(form.get("tags")),
      mime: file.type,
      bytes: Buffer.from(await file.arrayBuffer()),
      width: num(form.get("width")),
      height: num(form.get("height")),
      source: str(form.get("source")),
    });

    return NextResponse.json({ id });
  } catch (err) {
    console.error("[photos]", err);
    const setup = explainDbError(err);
    if (setup) return NextResponse.json({ error: setup }, { status: 503 });
    return NextResponse.json({ error: "Could not save that photo." }, { status: 500 });
  }
}
