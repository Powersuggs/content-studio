"use client";

/**
 * Shrink a photo in the browser before it is sent.
 *
 * A phone photo is routinely eight megabytes and four thousand pixels
 * wide. A slide is 1080 across. Sending the original would push past the
 * serverless request limit, fill the database with detail nobody will
 * ever see, and make every upload feel broken on a weak connection.
 *
 * Done here rather than on the server because the bytes have to cross the
 * wire either way, and shrinking first is the only version where the slow
 * part gets smaller.
 */

/** Generous enough to crop into and still fill a 1080-wide slide. */
const MAX_EDGE = 2000;
const QUALITY = 0.85;

export interface Downscaled {
  blob: Blob;
  width: number;
  height: number;
  originalBytes: number;
}

export async function downscale(file: File): Promise<Downscaled> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error("That file could not be read as an image.");

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot resize images.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  // PNG is kept for images that may have transparency, since re-encoding
  // one as JPEG puts a black box behind a logo. Everything else becomes
  // JPEG, which is several times smaller for a photograph.
  const keepPng = file.type === "image/png";
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, keepPng ? "image/png" : "image/jpeg", QUALITY),
  );
  if (!blob) throw new Error("Could not shrink that image.");

  return { blob, width, height, originalBytes: file.size };
}
