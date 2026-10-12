const ERRORS: Record<string, string> = {
  "1": "That email and password didn't work.",
  suspended: "That account is suspended.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <form
        method="POST"
        action="/api/login"
        className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-panel p-6"
      >
        <div>
          <h1 className="text-lg font-semibold text-text">Content Studio</h1>
          <p className="mt-1 text-sm text-muted">Sign in to your account.</p>
        </div>

        <input type="hidden" name="next" value={params.next ?? "/dashboard"} />

        <label className="block space-y-1">
          <span className="text-xs text-muted">Email</span>
          <input
            type="email"
            name="email"
            autoFocus
            autoComplete="username"
            className="w-full rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-text outline-none focus:border-accent"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-muted">Password</span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            className="w-full rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-text outline-none focus:border-accent"
          />
        </label>

        {params.error && (
          <p className="text-xs text-warn">
            {ERRORS[params.error] ?? "That didn't work."}
          </p>
        )}

        <button
          type="submit"
          className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-bg"
        >
          Sign in
        </button>

        <p className="text-xs text-muted">
          First time since the update? Leave the email blank and enter the old shared
          password to claim your account.
        </p>
      </form>
    </div>
  );
}
