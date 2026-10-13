import { randomInt } from "node:crypto";
import { query, queryOne } from "@/lib/db";
import { currentAccountId } from "@/lib/auth/current-account";

/**
 * Invite codes.
 *
 * Every query here names `invite_codes`, which deliberately has row-level
 * security OFF, because signup has to read it before any session exists.
 * That means the scoping is this file's job rather than the database's:
 * management functions filter by created_by, and redemption is guarded by
 * the code itself being unguessable.
 */

/**
 * No I, O, 0 or 1. People read these off a screen and type them into a
 * phone, and those four are where that goes wrong.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 16;
const GROUP = 4;

export interface InviteCode {
  code: string;
  note: string | null;
  maxUses: number;
  uses: number;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  /** Derived, so the UI never has to recompute the same three conditions. */
  status: "active" | "used up" | "expired" | "revoked";
}

function generateCode(): string {
  // randomInt is rejection-sampled, so no modulo bias across the alphabet.
  let raw = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    raw += ALPHABET[randomInt(ALPHABET.length)];
  }
  return raw.match(new RegExp(`.{1,${GROUP}}`, "g"))!.join("-");
}

/** Accepts whatever the person pasted: spaces, lowercase, missing dashes. */
export function normalizeCode(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!cleaned) return "";
  return cleaned.match(new RegExp(`.{1,${GROUP}}`, "g"))!.join("-");
}

function toInvite(row: {
  code: string;
  note: string | null;
  max_uses: number;
  uses: number;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}): InviteCode {
  const expiresAt = row.expires_at ? new Date(row.expires_at) : null;
  const revokedAt = row.revoked_at ? new Date(row.revoked_at) : null;

  const status: InviteCode["status"] = revokedAt
    ? "revoked"
    : expiresAt && expiresAt.getTime() <= Date.now()
      ? "expired"
      : row.uses >= row.max_uses
        ? "used up"
        : "active";

  return {
    code: row.code,
    note: row.note,
    maxUses: row.max_uses,
    uses: row.uses,
    expiresAt,
    revokedAt,
    createdAt: new Date(row.created_at),
    status,
  };
}

export async function listInvites(): Promise<InviteCode[]> {
  const accountId = await currentAccountId();
  const rows = await query<Parameters<typeof toInvite>[0]>(
    `select code, note, max_uses, uses, expires_at, revoked_at, created_at
       from invite_codes
      where created_by = $1
      order by created_at desc
      limit 100`,
    [accountId],
  );
  return rows.map(toInvite);
}

export async function createInvite(input: {
  note?: string;
  maxUses?: number;
  expiresInDays?: number | null;
}): Promise<string> {
  const accountId = await currentAccountId();
  const code = generateCode();

  const maxUses = Math.max(1, Math.min(input.maxUses ?? 1, 100));
  const expiresInDays =
    input.expiresInDays === null || input.expiresInDays === undefined
      ? null
      : Math.max(1, Math.min(input.expiresInDays, 365));

  await queryOne(
    `insert into invite_codes (code, created_by, note, max_uses, expires_at)
     values ($1, $2, $3, $4,
             case when $5::int is null then null
                  else now() + ($5::int || ' days')::interval end)
     returning code`,
    [code, accountId, input.note?.trim() || null, maxUses, expiresInDays],
  );

  return code;
}

export async function revokeInvite(code: string): Promise<void> {
  const accountId = await currentAccountId();
  // created_by in the WHERE is what stops one account revoking another's
  // codes. There is no RLS on this table to fall back on.
  await query(
    `update invite_codes
        set revoked_at = now()
      where code = $1 and created_by = $2 and revoked_at is null`,
    [normalizeCode(code), accountId],
  );
}

/**
 * Claims one use of a code, or returns null if it cannot be claimed.
 *
 * The check and the increment are a single UPDATE with the conditions in its
 * WHERE clause, so two people redeeming the last use of the same code at the
 * same moment cannot both succeed: the second one matches no row. Checking
 * first and updating after would let exactly that through.
 *
 * Runs with no session, so it cannot use currentAccountId. That is correct;
 * the person redeeming does not have an account yet.
 */
export async function claimInvite(rawCode: string): Promise<{ code: string } | null> {
  const code = normalizeCode(rawCode);
  if (!code) return null;

  // scoping-exempt: redemption happens before an account exists, and the
  // code itself is the credential.
  const claimed = await queryOne<{ code: string }>(
    `update invite_codes
        set uses = uses + 1
      where code = $1
        and revoked_at is null
        and uses < max_uses
        and (expires_at is null or expires_at > now())
      returning code`,
    [code],
  );

  return claimed ?? null;
}

/** Gives back a use after a signup fails downstream of claiming. */
export async function releaseInvite(code: string): Promise<void> {
  // scoping-exempt: compensating action for claimInvite, same no-session path.
  await query(
    `update invite_codes set uses = greatest(uses - 1, 0) where code = $1`,
    [normalizeCode(code)],
  );
}
