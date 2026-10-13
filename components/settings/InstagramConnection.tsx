import { Instagram, CheckCircle2, AlertTriangle, Link2 } from "lucide-react";
import { getConnection } from "@/lib/ig/token-store";

/**
 * The Instagram connection panel.
 *
 * Shows one of three states, because these need different things from the
 * person and lumping them together is how a dead connection goes unnoticed
 * for weeks:
 *
 *   not connected  -- a Connect button
 *   connected      -- who is connected, when the token expires, a way out
 *   needs attention -- expired token, or insights permission not granted,
 *                      both of which look like "connected" but silently
 *                      produce empty analytics
 */
export default async function InstagramConnection() {
  const connection = await getConnection().catch(() => null);

  if (!connection) {
    return (
      <Panel>
        <Header />
        <p className="text-sm text-muted">
          Connect your Instagram account and the app will sync your posts and
          their metrics, which is what every analysis page reads. Nothing is
          posted on your behalf and your messages are never read.
        </p>
        <ConnectButton label="Connect Instagram" />
        <p className="text-xs text-faint">
          You will be sent to Instagram to approve it. Approve both permissions
          it asks for -- without the insights one, views, reach, and saves
          come back empty.
        </p>
      </Panel>
    );
  }

  const now = Date.now();
  const expired = connection.expiresAt ? connection.expiresAt.getTime() <= now : false;
  const daysLeft = connection.expiresAt
    ? Math.floor((connection.expiresAt.getTime() - now) / 86_400_000)
    : null;
  const missingInsights =
    connection.grantedScopes.length > 0 &&
    !connection.grantedScopes.includes("instagram_business_manage_insights");

  return (
    <Panel>
      <Header />

      <div className="flex flex-wrap items-center gap-2">
        {expired ? (
          <AlertTriangle size={16} strokeWidth={1.75} className="shrink-0 text-warn" />
        ) : (
          <CheckCircle2 size={16} strokeWidth={1.75} className="shrink-0 text-accent" />
        )}
        <p className="text-sm text-text">
          {connection.username ? (
            <>
              Connected as{" "}
              <span className="font-medium">@{connection.username}</span>
            </>
          ) : (
            <>Connected</>
          )}
        </p>
      </div>

      <dl className="space-y-1 text-xs">
        {connection.connectedAt && (
          <Row
            label="Connected"
            value={connection.connectedAt.toLocaleDateString()}
          />
        )}
        <Row
          label="Access expires"
          value={
            !connection.expiresAt
              ? "Unknown -- will be set at the next refresh"
              : expired
                ? "Expired"
                : `${connection.expiresAt.toLocaleDateString()} (${daysLeft} day${daysLeft === 1 ? "" : "s"} left)`
          }
          tone={expired ? "warn" : undefined}
        />
        <Row
          label="Instagram ID"
          value={connection.igUserId}
        />
      </dl>

      {expired && (
        <Notice tone="warn">
          The access Instagram granted has run out, so syncing has stopped.
          Reconnect to start it again -- your existing posts and metrics
          are untouched.
        </Notice>
      )}

      {missingInsights && !expired && (
        <Notice tone="warn">
          Insights permission was not granted, so views, reach, saves, and watch
          time will stay empty. Reconnect and approve all the permissions
          Instagram asks for to fix it.
        </Notice>
      )}

      <div className="flex flex-wrap gap-2">
        <ConnectButton label="Reconnect" />
        <form method="POST" action="/api/instagram/disconnect">
          <button
            type="submit"
            className="rounded-lg border border-border px-3 py-2 text-sm text-muted transition-colors hover:border-warn hover:text-warn"
          >
            Disconnect
          </button>
        </form>
      </div>

      <p className="text-xs text-faint">
        Disconnecting stops all syncing and removes the stored token. Your posts
        and metrics are kept, so reconnecting resumes where you left off. To
        remove them as well, see the{" "}
        <a href="/data-deletion" className="text-accent hover:underline">
          data deletion page
        </a>
        .
      </p>
    </Panel>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-border bg-panel p-4">
      {children}
    </section>
  );
}

function Header() {
  return (
    <div className="flex items-center gap-2">
      <Instagram size={18} strokeWidth={1.75} className="text-accent" />
      <h2 className="text-sm font-semibold text-text">Instagram</h2>
    </div>
  );
}

function ConnectButton({ label }: { label: string }) {
  // A plain link, not a form: starting OAuth is a safe, idempotent navigation
  // and Instagram has to be reached by a top-level GET anyway.
  return (
    <a
      href="/api/instagram/connect"
      className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-bg"
    >
      <Link2 size={16} strokeWidth={2} />
      {label}
    </a>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warn";
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className={tone === "warn" ? "text-warn" : "text-text"}>{value}</dd>
    </div>
  );
}

function Notice({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "warn";
}) {
  return (
    <p
      className={`rounded-lg border px-3 py-2 text-xs ${
        tone === "warn"
          ? "border-warn/40 bg-warn/10 text-warn"
          : "border-border bg-panel-2 text-muted"
      }`}
    >
      {children}
    </p>
  );
}
