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
          <p className="mt-1 text-sm text-muted">Enter the password to continue.</p>
        </div>

        <input type="hidden" name="next" value={params.next ?? "/dashboard"} />

        <input
          type="password"
          name="password"
          placeholder="Password"
          autoFocus
          className="w-full rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-text outline-none focus:border-accent"
        />

        {params.error && (
          <p className="text-xs text-warn">That password didn&apos;t work.</p>
        )}

        <button
          type="submit"
          className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-bg"
        >
          Unlock
        </button>
      </form>
    </div>
  );
}
