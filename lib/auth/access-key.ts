const encoder = new TextEncoder();

/** A year. Long enough that you set it once per device and forget it. */
const ACCESS_DURATION_MS = 365 * 24 * 60 * 60 * 1000;

export const ACCESS_COOKIE = "access";
export const ACCESS_QUERY_PARAM = "key";

/**
 * The secret-link gate.
 *
 * This is deliberately NOT a login. There is no account, no password and no
 * form. Holding the link is the whole credential: visit once per device, a
 * cookie is set, and the app opens normally from then on.
 *
 * It exists because "I never want to type a password" and "anyone with the
 * URL can read my business data" are different things, and only the first
 * was ever wanted.
 *
 * Runs inside Edge middleware, so Web Crypto only -- no node:crypto here.
 */

function configuredKey(): string | null {
  const key = process.env.ACCESS_KEY;
  return key && key.length >= 16 ? key : null;
}

/**
 * Whether the gate is switched on at all.
 *
 * With no ACCESS_KEY set the app behaves exactly as it did before this
 * existed. That matters: deploying this must not lock anyone out of their
 * own site before they have had a chance to set the variable.
 */
export function isAccessGateEnabled(): boolean {
  return configuredKey() !== null;
}

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

/** Constant time, so a wrong value cannot be narrowed down by timing it. */
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

/** Does this query-string value match the configured key? */
export function matchesAccessKey(provided: string | null): boolean {
  const key = configuredKey();
  if (!key || !provided) return false;
  return timingSafeEqual(provided, key);
}

/**
 * The cookie value: "a1.<expires>.<signature>".
 *
 * The key itself is never put in the cookie. If the cookie ever leaked it
 * would give someone access until it expired, but it would not hand them
 * the key, so revoking is a matter of changing ACCESS_KEY in one place.
 */
export async function createAccessToken(): Promise<string> {
  const expires = Date.now() + ACCESS_DURATION_MS;
  const payload = `a1.${expires}`;
  return `${payload}.${await sign(payload)}`;
}

export interface AccessCheck {
  valid: boolean;
  /** When this cookie runs out, so the caller can decide to extend it. */
  expiresAt: number | null;
}

export async function readAccessToken(
  token: string | undefined,
): Promise<AccessCheck> {
  const invalid: AccessCheck = { valid: false, expiresAt: null };
  if (!token) return invalid;

  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "a1") return invalid;

  const expires = Number(parts[1]);
  if (!Number.isFinite(expires) || Date.now() > expires) return invalid;

  const expected = await sign(`a1.${expires}`);
  if (!timingSafeEqual(expected, parts[2])) return invalid;

  return { valid: true, expiresAt: expires };
}

export async function verifyAccessToken(token: string | undefined): Promise<boolean> {
  return (await readAccessToken(token)).valid;
}

/**
 * Should this cookie be re-issued on the way through?
 *
 * The cookie is renewed whenever it has less than ten months left, which
 * means ordinary use keeps it alive forever: open the site once in any
 * twelve-month stretch and it never lapses. Renewing on every single
 * request instead would put a Set-Cookie on every response for no gain.
 */
export function shouldRenewAccess(expiresAt: number | null): boolean {
  if (expiresAt === null) return false;
  const TEN_MONTHS_MS = 304 * 24 * 60 * 60 * 1000;
  return expiresAt - Date.now() < TEN_MONTHS_MS;
}

export const ACCESS_COOKIE_MAX_AGE = Math.floor(ACCESS_DURATION_MS / 1000);
