import { CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { getDeletionRequest } from "@/lib/ig/data-deletion";

/**
 * The status page Meta's data deletion callback points at.
 *
 * This must work with no login. Meta's reviewer opens it cold, from a
 * confirmation code, with no session and no account here -- and so does the
 * person who asked for the deletion, who by definition no longer has a
 * connection to this app. It is listed in PUBLIC_PATHS in middleware.ts for
 * exactly that reason.
 *
 * It says what happened and nothing else. No navigation into the app, no
 * sign-in prompt, no account details: a confirmation code is not proof of
 * identity, so this page never shows whose data it was.
 */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Instagram data deletion - Content Studio",
};

const STATES = {
  pending: {
    Icon: Clock,
    tone: "text-muted",
    heading: "Deletion in progress",
    body:
      "We have your request and are working through it. Reload this page in a " +
      "few minutes to see it confirmed.",
  },
  completed: {
    Icon: CheckCircle2,
    tone: "text-accent",
    heading: "Your Instagram data has been deleted",
    body:
      "Everything Content Studio had pulled from your Instagram account is " +
      "gone: your synced posts, their metrics, and the analysis built from " +
      "them. The connection to your Instagram account has been removed, so " +
      "nothing further will be collected.",
  },
  failed: {
    Icon: AlertTriangle,
    tone: "text-warn",
    heading: "Something went wrong",
    body:
      "We recorded your request but could not finish it. Email " +
      "contact@powersuggs.com with the confirmation code below and we will " +
      "complete the deletion by hand.",
  },
} as const;

export default async function InstagramDataDeletionStatusPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const request = await getDeletionRequest(code).catch(() => null);

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <main className="w-full max-w-lg space-y-4 rounded-xl border border-border bg-panel p-6">
        <header>
          <h1 className="text-lg font-semibold text-text">Content Studio</h1>
          <p className="mt-1 text-sm text-muted">Instagram data deletion</p>
        </header>

        {!request ? (
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <AlertTriangle
                size={20}
                strokeWidth={1.75}
                className="mt-0.5 shrink-0 text-warn"
              />
              <div>
                <h2 className="text-sm font-medium text-text">
                  No request found for that code
                </h2>
                <p className="mt-1 text-sm text-muted">
                  The code may have been mistyped, or the request may never have
                  reached us. Email{" "}
                  <a
                    href="mailto:contact@powersuggs.com"
                    className="text-accent underline"
                  >
                    contact@powersuggs.com
                  </a>{" "}
                  and we will sort it out.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <StatusBody request={request} />
        )}

        <footer className="border-t border-border pt-3">
          <p className="text-xs text-muted">Confirmation code</p>
          <p className="mt-1 break-all font-mono text-xs text-text">{code}</p>
        </footer>
      </main>
    </div>
  );
}

function StatusBody({
  request,
}: {
  request: NonNullable<Awaited<ReturnType<typeof getDeletionRequest>>>;
}) {
  const state = STATES[request.status] ?? STATES.pending;
  const { Icon } = state;

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <Icon
          size={20}
          strokeWidth={1.75}
          className={`mt-0.5 shrink-0 ${state.tone}`}
        />
        <div>
          <h2 className="text-sm font-medium text-text">{state.heading}</h2>
          <p className="mt-1 text-sm text-muted">{state.body}</p>
        </div>
      </div>

      <dl className="space-y-1 text-xs">
        <div className="flex gap-2">
          <dt className="text-muted">Requested</dt>
          <dd className="text-text">
            {request.requestedAt.toISOString().replace("T", " ").slice(0, 16)} UTC
          </dd>
        </div>
        {request.completedAt && (
          <div className="flex gap-2">
            <dt className="text-muted">Completed</dt>
            <dd className="text-text">
              {request.completedAt.toISOString().replace("T", " ").slice(0, 16)}{" "}
              UTC
            </dd>
          </div>
        )}
      </dl>

      {request.status === "completed" && (
        <p className="text-xs text-muted">
          Anything you wrote yourself -- scripts, boards, your voice profile --
          was not part of this request and is still in your account. To close
          the account entirely, email{" "}
          <a
            href="mailto:contact@powersuggs.com"
            className="text-accent underline"
          >
            contact@powersuggs.com
          </a>
          .
        </p>
      )}
    </div>
  );
}
