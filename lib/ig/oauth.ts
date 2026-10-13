import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Instagram's OAuth flow, the "Instagram API with Instagram Login" variant.
 *
 * This is the flow that does NOT require the user to have a Facebook Page
 * linked to their Instagram account, which matters a great deal: requiring a
 * linked Page is the single biggest reason people abandon a connect flow.
 * They sign in with Instagram itself.
 *
 * Three legs, because Instagram does not hand you a usable token directly:
 *   1. Send the user to instagram.com to approve. They come back with a code.
 *   2. Trade the code for a SHORT-lived token. It lasts one hour.
 *   3. Trade the short-lived token for a LONG-lived one. It lasts 60 days,
 *      and can be refreshed for another 60 as long as it is at least 24
 *      hours old and not yet expired.
 *
 * Skipping leg 3 is a mistake that looks like success: everything works for
 * an hour and then quietly stops.
 */

const AUTHORIZE_URL = "https://www.instagram.com/oauth/authorize";
const SHORT_TOKEN_URL = "https://api.instagram.com/oauth/access_token";
const LONG_TOKEN_URL = "https://graph.instagram.com/access_token";

/**
 * What we ask the user for.
 *
 * `instagram_business_basic` covers the profile and the media list.
 * `instagram_business_manage_insights` covers views, reach, saves and
 * shares, which is the entire analytical half of this app -- without it the
 * dashboard has nothing to show.
 *
 * Both of these require Advanced Access, which requires Meta App Review and
 * Business Verification. Until that is granted the flow works only for
 * Instagram accounts that have a role on the Meta app.
 */
export const IG_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_insights",
] as const;

/** 60 days, per Instagram's long-lived token lifetime. */
const LONG_TOKEN_TTL_MS = 60 * 24 * 60 * 60 * 1000;

export class InstagramOAuthError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "InstagramOAuthError";
  }
}

interface OAuthConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
}

/**
 * Reads the Meta app credentials, failing with an instruction rather than a
 * stack trace. Anyone self-hosting this will hit this message, so it says
 * where to go.
 */
export function getOAuthConfig(): OAuthConfig {
  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  const baseUrl = getBaseUrl();

  if (!appId || !appSecret) {
    throw new InstagramOAuthError(
      "Instagram is not configured on this server. Add INSTAGRAM_APP_ID and " +
        "INSTAGRAM_APP_SECRET from your Meta app's Instagram settings to the " +
        "environment variables, then redeploy.",
    );
  }

  return { appId, appSecret, redirectUri: `${baseUrl}/api/instagram/callback` };
}

/**
 * The app's own public origin.
 *
 * Instagram requires the redirect URI to match what is registered in the
 * Meta app byte for byte, so this cannot be guessed from the incoming
 * request -- a request arriving at a Vercel preview URL would produce a
 * redirect URI Instagram rejects. An explicit APP_URL wins; Vercel's own
 * production URL is the fallback.
 */
export function getBaseUrl(): string {
  const explicit = process.env.APP_URL;
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercel) return `https://${vercel.replace(/\/+$/, "")}`;

  return "http://localhost:3000";
}

// ---------------------------------------------------------------------
// CSRF state
// ---------------------------------------------------------------------

/**
 * The `state` parameter, signed rather than stored.
 *
 * Without this, an attacker can send a victim a crafted callback URL
 * carrying the attacker's own authorization code, and the victim's account
 * silently ends up connected to the attacker's Instagram. The state binds
 * the callback to the account that started the flow, and it is signed so it
 * cannot be forged, which means no database table and no cleanup job.
 *
 * Format: <accountId>.<nonce>.<expiry>.<signature>
 */
export function createOAuthState(accountId: number, ttlMs = 10 * 60 * 1000): string {
  const nonce = randomBytes(16).toString("base64url");
  const expires = Date.now() + ttlMs;
  const payload = `${accountId}.${nonce}.${expires}`;
  return `${payload}.${signState(payload)}`;
}

export function verifyOAuthState(state: string | null): { accountId: number } | null {
  if (!state) return null;

  const parts = state.split(".");
  if (parts.length !== 4) return null;

  const [accountIdRaw, , expiresRaw, signature] = parts;
  const payload = parts.slice(0, 3).join(".");

  const expected = signState(payload);
  // Constant-time, so the comparison does not leak the signature one byte
  // at a time to anyone willing to make enough requests.
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const expires = Number(expiresRaw);
  if (!Number.isFinite(expires) || Date.now() > expires) return null;

  const accountId = Number(accountIdRaw);
  if (!Number.isInteger(accountId) || accountId < 1) return null;

  return { accountId };
}

function signState(payload: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new InstagramOAuthError("SESSION_SECRET is not set; cannot sign the OAuth state.");
  }
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

// ---------------------------------------------------------------------
// Leg 1: send them to Instagram
// ---------------------------------------------------------------------

export function buildAuthorizeUrl(state: string): string {
  const { appId, redirectUri } = getOAuthConfig();

  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", IG_SCOPES.join(","));
  url.searchParams.set("state", state);
  return url.toString();
}

// ---------------------------------------------------------------------
// Legs 2 and 3: code -> short-lived -> long-lived
// ---------------------------------------------------------------------

export interface ConnectedInstagram {
  igUserId: string;
  accessToken: string;
  expiresAt: Date;
  grantedScopes: string[];
}

/**
 * Turns the code from the callback into a 60-day token.
 *
 * Both legs are here together on purpose. A short-lived token is never worth
 * storing -- it would expire before most people finished looking at the
 * settings page -- so there is no state in which this function should return
 * having done only half the job.
 */
export async function exchangeCodeForLongLivedToken(
  code: string,
): Promise<ConnectedInstagram> {
  const { appId, appSecret, redirectUri } = getOAuthConfig();

  // Leg 2. Form-encoded POST, not JSON; Instagram rejects JSON here.
  const body = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
  });

  const shortRes = await fetch(SHORT_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const shortJson = (await shortRes.json().catch(() => null)) as {
    access_token?: string;
    user_id?: number | string;
    permissions?: string | string[];
    error_message?: string;
    error?: { message?: string };
  } | null;

  if (!shortRes.ok || !shortJson?.access_token) {
    throw new InstagramOAuthError(
      describeTokenError(
        "Instagram would not issue a token for that approval",
        shortRes.status,
        shortJson,
      ),
      shortJson,
    );
  }

  const igUserId = shortJson.user_id != null ? String(shortJson.user_id) : "";
  const grantedScopes = normaliseScopes(shortJson.permissions);

  // Leg 3. A GET, unlike leg 2.
  const longUrl = new URL(LONG_TOKEN_URL);
  longUrl.searchParams.set("grant_type", "ig_exchange_token");
  longUrl.searchParams.set("client_secret", appSecret);
  longUrl.searchParams.set("access_token", shortJson.access_token);

  const longRes = await fetch(longUrl.toString());
  const longJson = (await longRes.json().catch(() => null)) as {
    access_token?: string;
    expires_in?: number;
    permissions?: string | string[];
    error?: { message?: string };
  } | null;

  if (!longRes.ok || !longJson?.access_token) {
    throw new InstagramOAuthError(
      describeTokenError(
        "Instagram approved the connection but would not issue a long-lived token",
        longRes.status,
        longJson,
      ),
      longJson,
    );
  }

  const expiresInMs =
    typeof longJson.expires_in === "number" && longJson.expires_in > 0
      ? longJson.expires_in * 1000
      : LONG_TOKEN_TTL_MS;

  return {
    igUserId,
    accessToken: longJson.access_token,
    expiresAt: new Date(Date.now() + expiresInMs),
    grantedScopes: grantedScopes.length
      ? grantedScopes
      : normaliseScopes(longJson.permissions),
  };
}

function normaliseScopes(permissions: string | string[] | undefined): string[] {
  if (!permissions) return [];
  const list = Array.isArray(permissions) ? permissions : permissions.split(",");
  return list.map((p) => p.trim()).filter(Boolean);
}

/**
 * Instagram's token errors are famously unhelpful ("Invalid platform app").
 * The two most common causes by a wide margin are a redirect URI that does
 * not match the Meta app's registered list, and a reused code -- so name
 * them, rather than passing Meta's wording through untranslated.
 */
function describeTokenError(
  prefix: string,
  status: number,
  json: { error_message?: string; error?: { message?: string } } | null,
): string {
  const detail = json?.error_message ?? json?.error?.message ?? "";
  const hint =
    status === 400
      ? " This is usually one of two things: the redirect URI registered in your " +
        "Meta app does not exactly match this app's URL, or the approval was " +
        "already used (they are single-use, so start the connection again)."
      : "";
  return `${prefix}${detail ? `: ${detail}` : ` (HTTP ${status})`}.${hint}`;
}

/**
 * Whether a stored token is close enough to expiry to be worth refreshing.
 *
 * Instagram refuses to refresh a token younger than 24 hours, and refuses
 * once it has already expired, so there is a window and both edges matter.
 */
export function needsRefresh(expiresAt: Date | null, refreshedAt: Date | null): boolean {
  const now = Date.now();
  if (refreshedAt && now - refreshedAt.getTime() < 24 * 60 * 60 * 1000) return false;
  if (!expiresAt) return true;
  const daysLeft = (expiresAt.getTime() - now) / (24 * 60 * 60 * 1000);
  return daysLeft < 10 && expiresAt.getTime() > now;
}
