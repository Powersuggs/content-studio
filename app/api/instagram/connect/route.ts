import { NextResponse } from "next/server";
import { currentAccountId } from "@/lib/auth/current-account";
import {
  buildAuthorizeUrl,
  createOAuthState,
  InstagramOAuthError,
} from "@/lib/ig/oauth";

/**
 * Starts the Instagram connection.
 *
 * A GET, because it is reached by clicking a link. It does not change
 * anything -- it only redirects to Instagram with a signed state that binds
 * the eventual callback to this account.
 */
export async function GET() {
  try {
    const accountId = await currentAccountId();
    const state = createOAuthState(accountId);
    return NextResponse.redirect(buildAuthorizeUrl(state));
  } catch (err) {
    const message =
      err instanceof InstagramOAuthError
        ? err.message
        : "Could not start the Instagram connection.";
    console.error("[instagram/connect]", err);
    return NextResponse.redirect(
      new URL(
        `/settings?ig_error=${encodeURIComponent(message)}`,
        process.env.APP_URL ?? "http://localhost:3000",
      ),
    );
  }
}
