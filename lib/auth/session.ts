const encoder = new TextEncoder();
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** The owner account created by migration 0009. Legacy sessions map to it. */
export const OWNER_ACCOUNT_ID = 1;

export type Session = {
  accountId: number;
  /**
   * True for a pre-accounts cookie: proof someone knew APP_PASSWORD, but not
   * proof of WHO they are. Middleware sends these to /setup so the owner can
   * claim the account with a real email and password. Remove this path once
   * APP_PASSWORD is retired.
   */
  legacy: boolean;
};

async function getKey(): Promise<CryptoKey> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET environment variable is not set");
  }
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function toBase64Url(bytes: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

async function sign(payload: string): Promise<string> {
  const key = await getKey();
  return toBase64Url(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
}

/**
 * Create a signed, expiring session token for one account:
 *   "v2.<accountId>.<expiresAtMs>.<hmacOfEverythingBefore>"
 * The account id is inside the signed payload, so it cannot be edited by
 * whoever holds the cookie without invalidating the signature.
 */
export async function createSessionToken(accountId: number): Promise<string> {
  if (!Number.isInteger(accountId) || accountId < 1) {
    throw new Error(`createSessionToken: invalid accountId ${accountId}`);
  }
  const expires = Date.now() + SESSION_DURATION_MS;
  const payload = `v2.${accountId}.${expires}`;
  return `${payload}.${await sign(payload)}`;
}

/**
 * Issue a session in the pre-accounts shape: authenticated, but not tied to a
 * named person. Middleware routes these to /setup. Used only when someone
 * signs in with the shared APP_PASSWORD on an owner account that has not been
 * claimed yet, so that path always lands on the claim screen rather than
 * quietly handing out an owner session.
 */
export async function createUnclaimedSessionToken(): Promise<string> {
  const expires = Date.now() + SESSION_DURATION_MS;
  return `${expires}.${await sign(String(expires))}`;
}

/**
 * Verify a session token and return who it belongs to, or null.
 *
 * Runs inside Edge middleware, so Web Crypto only -- no node:crypto here.
 * Password hashing lives in lib/auth/password.ts, which is Node-only and
 * must never be imported from this file.
 */
export async function verifySessionToken(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  const parts = token.split(".");

  // Current format: v2.<accountId>.<expires>.<signature>
  if (parts.length === 4 && parts[0] === "v2") {
    const [, accountStr, expiresStr, signature] = parts;
    const accountId = Number(accountStr);
    const expires = Number(expiresStr);
    if (!Number.isInteger(accountId) || accountId < 1) return null;
    if (!Number.isFinite(expires) || Date.now() > expires) return null;
    const expected = await sign(`v2.${accountId}.${expires}`);
    if (!timingSafeEqual(expected, signature)) return null;
    return { accountId, legacy: false };
  }

  // Pre-accounts format: <expires>.<signature>. Still valid (it required the
  // shared password), but anonymous, so it is treated as the owner and sent
  // to /setup rather than straight into the app.
  if (parts.length === 2) {
    const [expiresStr, signature] = parts;
    const expires = Number(expiresStr);
    if (!expiresStr || !signature) return null;
    if (!Number.isFinite(expires) || Date.now() > expires) return null;
    const expected = await sign(expiresStr);
    if (!timingSafeEqual(expected, signature)) return null;
    return { accountId: OWNER_ACCOUNT_ID, legacy: true };
  }

  return null;
}
