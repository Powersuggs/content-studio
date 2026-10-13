import { NextResponse, type NextRequest } from "next/server";
import { runAsAccount } from "@/lib/auth/background-account";
import { queryOne } from "@/lib/db";
import { fetchProfile } from "@/lib/ig/client";
import {
  exchangeCodeForLongLivedToken,
  getBaseUrl,
  InstagramOAuthError,
  IG_SCOPES,
  verifyOAuthState,
} from "@/lib/ig/oauth";
import { persistConnection } from "@/lib/ig/token-store";

/**
 * Where Instagram sends the user back.
 *
 * This route is reached with only a `code` and the `state` we signed on the
 * way out. It must not trust the session cookie to decide whose account to
 * connect: the whole point of the signed state is that it, and not the
 * cookie, says which account started this flow. Trusting the cookie here is
 * the login-CSRF hole that lets someone else's Instagram get attached to
 * your account.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorReason = url.searchParams.get("error_reason");

  // The user pressed Cancel on Instagram's screen. Not an error worth
  // shouting about.
  if (error) {
    const message =
      errorReason === "user_denied"
        ? "Instagram connection cancelled."
        : `Instagram returned an error: ${url.searchParams.get("error_description") ?? error}`;
    return redirectToSettings(message, errorReason === "user_denied" ? "info" : "error");
  }

  const verified = verifyOAuthState(state);
  if (!verified) {
    return redirectToSettings(
      "That connection link was invalid or had expired. Start the connection again.",
      "error",
    );
  }

  if (!code) {
    return redirectToSettings("Instagram did not send back an approval code.", "error");
  }

  try {
    const connection = await exchangeCodeForLongLivedToken(code);

    if (!connection.igUserId) {
      return redirectToSettings(
        "Instagram did not say which account was connected. Try again.",
        "error",
      );
    }

    // Refuse before writing if another account already holds this Instagram
    // profile. The database has a unique index that would stop it anyway,
    // but a plain constraint violation reaches the user as "something went
    // wrong", and this is a situation worth explaining properly.
    const takenBy = await queryOne<{ account_id: string }>(
      `select account_id from auth where ig_user_id = $1`,
      [connection.igUserId],
    );
    if (takenBy && String(takenBy.account_id) !== String(verified.accountId)) {
      return redirectToSettings(
        "That Instagram account is already connected to a different Content Studio " +
          "account. Disconnect it there first.",
        "error",
      );
    }

    // Everything below touches account-scoped tables, so it runs inside the
    // account context the signed state proved.
    await runAsAccount(verified.accountId, async () => {
      let username: string | null = null;
      try {
        const profile = await fetchProfile(connection.igUserId, connection.accessToken);
        username = profile.username ?? null;
      } catch (err) {
        // A failed profile lookup is not a failed connection. The token is
        // valid; the username is a nicety the next sync will fill in.
        console.error("[instagram/callback] profile lookup failed", err);
      }

      await persistConnection({
        igUserId: connection.igUserId,
        accessToken: connection.accessToken,
        refreshedAt: new Date(),
        expiresAt: connection.expiresAt,
        grantedScopes: connection.grantedScopes,
        username,
      });
    });

    // Instagram lets people untick individual permissions. Without insights
    // the analytics half of this app has nothing to read, so say so now
    // rather than letting them find empty charts later.
    const missing = IG_SCOPES.filter(
      (s) => connection.grantedScopes.length > 0 && !connection.grantedScopes.includes(s),
    );
    if (missing.includes("instagram_business_manage_insights")) {
      return redirectToSettings(
        "Instagram connected, but you did not approve access to insights, so views, " +
          "reach and saves will be empty. Reconnect and approve all permissions to " +
          "fix that.",
        "warn",
      );
    }

    return redirectToSettings("Instagram connected.", "ok");
  } catch (err) {
    console.error("[instagram/callback]", err);
    const message =
      err instanceof InstagramOAuthError
        ? err.message
        : "Could not finish connecting Instagram. Try again.";
    return redirectToSettings(message, "error");
  }
}

function redirectToSettings(message: string, kind: "ok" | "error" | "warn" | "info") {
  const target = new URL("/settings", getBaseUrl());
  target.searchParams.set(kind === "ok" ? "ig_ok" : kind === "info" ? "ig_info" : kind === "warn" ? "ig_warn" : "ig_error", message);
  return NextResponse.redirect(target);
}
