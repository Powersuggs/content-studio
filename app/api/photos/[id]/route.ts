import { NextResponse } from "next/server";
import { getPhotoBytes } from "@/lib/photos/queries";

export const runtime = "nodejs";

/**
 * Serves one photo.
 *
 * Scoped to the account by the query, not by obscurity: an id from
 * someone else's bank returns 404 rather than their picture.
 *
 * A photo's bytes never change once stored, so this is immutable. Editing
 * a label does not touch the image, and replacing a photo means a new row
 * with a new id, which is a different URL.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n) || n < 1) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const photo = await getPhotoBytes(n);
    if (!photo) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return new NextResponse(new Uint8Array(photo.bytes), {
      headers: {
        "Content-Type": photo.mime,
        "Content-Length": String(photo.bytes.byteLength),
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    console.error("[photos/:id]", err);
    return NextResponse.json({ error: "Could not load that photo." }, { status: 500 });
  }
}
