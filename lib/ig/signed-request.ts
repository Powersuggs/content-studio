import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifying Meta's `signed_request`.
 *
 * Meta's deauthorize and data-deletion callbacks are POSTed to us by Meta,
 * not by a logged-in user, so there is no session to authenticate them. The
 * only proof they are genuine is a signature made with the app secret, which
 * only Meta and this server know.
 *
 * Verifying it is not optional. An unverified endpoint of this kind accepts
 * "delete everything for user X" from anybody on the internet who can guess
 * a user id.
 *
 * The wire format is two base64url segments joined by a dot:
 *   <signature>.<payload>
 * where the signature is HMAC-SHA256 over the *payload segment exactly as
 * sent* -- decoding it first and re-encoding would change the bytes and the
 * signature would never match.
 */

export interface SignedRequestPayload {
  /** The user's id on the platform that signed this. */
  user_id?: string;
  algorithm?: string;
  issued_at?: number;
  [key: string]: unknown;
}

export class SignedRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignedRequestError";
  }
}

export function parseSignedRequest(signed: string, appSecret: string): SignedRequestPayload {
  if (!signed || typeof signed !== "string") {
    throw new SignedRequestError("No signed_request was provided.");
  }

  const dot = signed.indexOf(".");
  if (dot < 1 || dot === signed.length - 1) {
    throw new SignedRequestError("Malformed signed_request.");
  }

  const encodedSig = signed.slice(0, dot);
  const encodedPayload = signed.slice(dot + 1);

  const expected = createHmac("sha256", appSecret).update(encodedPayload).digest();
  const provided = Buffer.from(encodedSig, "base64url");

  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    throw new SignedRequestError("signed_request signature did not verify.");
  }

  let payload: SignedRequestPayload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    throw new SignedRequestError("signed_request payload was not valid JSON.");
  }

  // Meta documents this as HMAC-SHA256. Anything else means either a format
  // change we have not accounted for or an attempt to talk us into a weaker
  // algorithm, and both deserve a refusal.
  if (payload.algorithm && payload.algorithm.toUpperCase() !== "HMAC-SHA256") {
    throw new SignedRequestError(`Unexpected signing algorithm: ${payload.algorithm}`);
  }

  return payload;
}

/**
 * Pulls the signed_request out of either encoding Meta might use. The
 * callbacks are documented as form-encoded, but accepting JSON as well costs
 * one branch and removes a whole class of silent failure.
 */
export async function readSignedRequest(request: Request): Promise<string | null> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as {
      signed_request?: string;
    } | null;
    return body?.signed_request ?? null;
  }

  const form = await request.formData().catch(() => null);
  const value = form?.get("signed_request");
  return typeof value === "string" ? value : null;
}
