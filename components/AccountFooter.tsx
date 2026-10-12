import { LogOut } from "lucide-react";
import { getSession } from "@/lib/auth/current-account";
import { queryOne } from "@/lib/db";

/**
 * Who you're signed in as, and the way out.
 *
 * This is a server component so it can read the session and look up the
 * email without shipping either to the client as props on every page.
 * Sign out is a form POST rather than a link, so a prefetcher or an
 * image loader can never log someone out by fetching a URL.
 */
export default async function AccountFooter() {
  const session = await getSession();
  if (!session) return null;

  const account = await queryOne<{ email: string | null }>(
    "select email from accounts where id = $1",
    [session.accountId],
  );

  return (
    <div className="mt-auto space-y-2 border-t border-border pt-3">
      {account?.email && (
        <p className="truncate px-3 text-xs text-muted" title={account.email}>
          {account.email}
        </p>
      )}
      <form method="POST" action="/api/logout">
        <button
          type="submit"
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-panel-2 hover:text-text"
        >
          <LogOut size={18} strokeWidth={1.75} />
          Sign out
        </button>
      </form>
    </div>
  );
}
