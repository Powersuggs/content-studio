import { AlertTriangle } from "lucide-react";

/**
 * Shown when a page cannot load because the database is not set up yet,
 * rather than because there is nothing to show.
 *
 * It names the exact file to run. "Something went wrong" sends someone to
 * their logs; this sends them to the fix.
 */
export default function SetupNotice({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3">
      <AlertTriangle
        size={18}
        strokeWidth={1.75}
        className="mt-0.5 shrink-0 text-warn"
      />
      <div className="min-w-0">
        <p className="text-sm text-warn">{message}</p>
        <p className="mt-1 text-xs text-muted">
          Run it in your database&rsquo;s SQL editor. Migrations are safe to
          run twice.
        </p>
      </div>
    </div>
  );
}
