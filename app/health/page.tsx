import { ShieldCheck, ShieldAlert } from "lucide-react";
import { readTableStates } from "@/lib/health/queries";
import { judge, repairScript } from "@/lib/health/expected";
import SetupNotice from "@/components/SetupNotice";
import { safeLoad } from "@/lib/db-errors";
import CopyBlock from "@/components/health/CopyBlock";

export const dynamic = "force-dynamic";

export default async function HealthPage() {
  const [states, error] = await safeLoad(() => readTableStates(), [], "health");
  const findings = judge(states);
  const bad = findings.filter((f) => f.severity !== "ok");
  const repair = repairScript(findings);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      {error && <SetupNotice message={error} />}

      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-text">
          {bad.length === 0 ? (
            <ShieldCheck size={18} strokeWidth={1.75} className="text-accent" />
          ) : (
            <ShieldAlert size={18} strokeWidth={1.75} className="text-warn" />
          )}
          Database check
        </h1>
        <p className="mt-1 text-sm text-muted">
          Looks at the live database rather than the code, and says whether the
          rules that separate accounts are actually switched on. A migration
          that never ran leaves no trace until something breaks, and the thing
          it breaks first is usually signing in.
        </p>
      </div>

      {bad.length === 0 ? (
        <p className="rounded-xl border border-accent/40 bg-accent/5 p-4 text-sm text-accent">
          All {findings.length} tables are as they should be. The two tables
          sign-in needs are readable, and everything holding your content is
          locked to one account with the rule forced.
        </p>
      ) : (
        <>
          <p className="rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm text-warn">
            {bad.length} {bad.length === 1 ? "thing is" : "things are"} wrong.
            The SQL to fix {bad.length === 1 ? "it" : "them"} is at the bottom of
            this page. Run it in Supabase, SQL Editor, then reload this page.
          </p>

          <ul className="space-y-2">
            {bad.map((f) => (
              <li
                key={f.table}
                className="rounded-lg border border-warn/40 bg-panel p-3 text-sm text-text"
              >
                <span className="font-mono text-xs text-warn">{f.table}</span>
                <p className="mt-1">{f.says}</p>
              </li>
            ))}
          </ul>

          {repair && <CopyBlock sql={repair} />}
        </>
      )}

      <details className="rounded-xl border border-border bg-panel p-3">
        <summary className="cursor-pointer text-xs text-muted">
          Everything that was checked ({findings.length} tables)
        </summary>
        <ul className="mt-2 space-y-1">
          {findings.map((f) => (
            <li key={f.table} className="flex items-center gap-2 text-xs">
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  f.severity === "ok" ? "bg-accent" : "bg-warn"
                }`}
              />
              <span className="font-mono text-faint">{f.table}</span>
              <span className="text-muted">{f.says}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
