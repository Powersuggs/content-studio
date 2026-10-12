import { redirect } from "next/navigation";
import { requireAccountId } from "@/lib/auth/current-account";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { queryOne } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  email: "That doesn't look like an email address.",
  short: `Your password needs to be at least ${MIN_PASSWORD_LENGTH} characters.`,
  mismatch: "The two passwords don't match.",
  taken: "Another account already uses that email.",
  session: "Your session expired. Log in again and retry.",
};

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const accountId = await requireAccountId();

  // This page is reached with a pre-accounts cookie, which proves only that
  // someone knew the shared password. If the account already has a password of
  // its own, that cookie must not be able to replace it: discard it and make
  // them sign in properly.
  const claimed = await queryOne<{ claimed: boolean }>(
    "select password_hash is not null as claimed from accounts where id = $1",
    [accountId],
  );
  if (claimed?.claimed) {
    redirect("/api/logout");
  }

  const owned = await queryOne<{ posts: number; scripts: number; boards: number }>(
    `select (select count(*) from posts   where account_id = $1) as posts,
            (select count(*) from scripts where account_id = $1) as scripts,
            (select count(*) from boards  where account_id = $1) as boards`,
    [accountId],
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <form
        method="POST"
        action="/api/setup"
        className="w-full max-w-md space-y-4 rounded-xl border border-border bg-panel p-6"
      >
        <div>
          <h1 className="text-lg font-semibold text-text">Set up your login</h1>
          <p className="mt-1 text-sm text-muted">
            Content Studio now gives each person their own account. Pick the email and
            password you&apos;ll use from now on. The shared password goes away once
            you&apos;ve done this.
          </p>
        </div>

        {owned && (
          <div className="rounded-lg border border-border bg-panel-2 px-3 py-2 text-xs text-muted">
            This account already owns{" "}
            <span className="text-text">{owned.posts} posts</span>,{" "}
            <span className="text-text">{owned.scripts} scripts</span> and{" "}
            <span className="text-text">{owned.boards} boards</span>. Nothing moves or
            changes.
          </div>
        )}

        <label className="block space-y-1">
          <span className="text-xs text-muted">Email</span>
          <input
            type="email"
            name="email"
            required
            autoFocus
            autoComplete="username"
            className="w-full rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-text outline-none focus:border-accent"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-muted">
            Password, at least {MIN_PASSWORD_LENGTH} characters
          </span>
          <input
            type="password"
            name="password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
            className="w-full rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-text outline-none focus:border-accent"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-muted">Password again</span>
          <input
            type="password"
            name="confirm"
            required
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
            className="w-full rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-text outline-none focus:border-accent"
          />
        </label>

        {params.error && (
          <p className="text-xs text-warn">
            {ERRORS[params.error] ?? "Something went wrong. Try again."}
          </p>
        )}

        <button
          type="submit"
          className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-bg"
        >
          Save and continue
        </button>
      </form>
    </div>
  );
}
