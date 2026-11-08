import { query, queryOne } from "@/lib/db";
import { currentAccountId } from "@/lib/auth/current-account";

/**
 * Reading and writing the photo bank.
 *
 * Nothing here ever selects the `bytes` column alongside a list. A listing
 * of forty photographs that dragged forty images through the connection
 * would be tens of megabytes to render a page of thumbnails, so the bytes
 * come back only from getPhotoBytes, one at a time, for the route that
 * serves them.
 */

export type PhotoKind = "person" | "scene";

export interface Photo {
  id: number;
  /** person or scene. Decides which slide layouts may hold it. */
  kind: PhotoKind;
  label: string | null;
  tags: string[];
  mime: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  source: string | null;
  createdAt: Date;
}

interface Row {
  id: string;
  kind: string;
  label: string | null;
  tags: string | null;
  mime: string;
  byte_size: number;
  width: number | null;
  height: number | null;
  source: string | null;
  created_at: string;
}

const COLUMNS =
  "id, kind, label, tags, mime, byte_size, width, height, source, created_at";

function toPhoto(r: Row): Photo {
  return {
    id: Number(r.id),
    kind: r.kind === "person" ? "person" : "scene",
    label: r.label,
    tags: (r.tags ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    mime: r.mime,
    byteSize: Number(r.byte_size),
    width: r.width,
    height: r.height,
    source: r.source,
    createdAt: new Date(r.created_at),
  };
}

export async function listPhotos(limit = 200): Promise<Photo[]> {
  const accountId = await currentAccountId();
  const rows = await query<Row>(
    `select ${COLUMNS} from photos
      where account_id = $1
      order by created_at desc
      limit $2`,
    [accountId, limit],
  );
  return rows.map(toPhoto);
}

export async function countPhotos(): Promise<{ count: number; bytes: number }> {
  const accountId = await currentAccountId();
  const row = await queryOne<{ n: string; total: string | null }>(
    `select count(*)::text as n, sum(byte_size)::text as total
       from photos where account_id = $1`,
    [accountId],
  );
  return { count: Number(row?.n ?? 0), bytes: Number(row?.total ?? 0) };
}

export async function savePhoto(input: {
  label?: string | null;
  tags?: string | null;
  mime: string;
  bytes: Buffer;
  width?: number | null;
  height?: number | null;
  source?: string | null;
}): Promise<number> {
  const accountId = await currentAccountId();
  const row = await queryOne<{ id: string }>(
    `insert into photos (account_id, label, tags, mime, bytes, byte_size, width, height, source)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     returning id`,
    [
      accountId,
      input.label?.trim() || null,
      input.tags?.trim() || null,
      input.mime,
      input.bytes,
      input.bytes.byteLength,
      input.width ?? null,
      input.height ?? null,
      input.source?.trim() || "upload",
    ],
  );
  return Number(row!.id);
}

/** The bytes themselves, for the serving route only. */
export async function getPhotoBytes(
  id: number,
): Promise<{ mime: string; bytes: Buffer } | null> {
  const accountId = await currentAccountId();
  const row = await queryOne<{ mime: string; bytes: Buffer }>(
    `select mime, bytes from photos where id = $1 and account_id = $2`,
    [id, accountId],
  );
  return row ?? null;
}

export async function updatePhoto(
  id: number,
  input: { label?: string | null; tags?: string | null; kind?: PhotoKind | null },
): Promise<void> {
  const accountId = await currentAccountId();
  await query(
    `update photos
        set label = coalesce($3, label),
            tags  = coalesce($4, tags),
            kind  = coalesce($5, kind)
      where id = $1 and account_id = $2`,
    [id, accountId, input.label ?? null, input.tags ?? null, input.kind ?? null],
  );
}

export async function deletePhoto(id: number): Promise<void> {
  const accountId = await currentAccountId();
  await query(`delete from photos where id = $1 and account_id = $2`, [id, accountId]);
}
