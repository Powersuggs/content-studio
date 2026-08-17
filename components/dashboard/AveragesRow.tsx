import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import type { AveragesRow as AveragesRowData, AverageMetric } from "@/lib/queries";

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(n < 10 ? 1 : 0);
}

function ChangeBadge({ pct }: { pct: number | null }) {
  if (pct === null) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-faint">
        <Minus size={12} /> no prior data
      </span>
    );
  }
  const positive = pct > 0;
  const flat = Math.abs(pct) < 0.5;
  const color = flat ? "text-muted" : positive ? "text-accent" : "text-warn";
  const Icon = flat ? Minus : positive ? ArrowUp : ArrowDown;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${color}`}>
      <Icon size={12} />
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function AverageCell({ label, metric }: { label: string; metric: AverageMetric }) {
  return (
    <div className="rounded-lg border border-border bg-panel p-4">
      <p className="text-xs text-faint">{label}</p>
      <p className="mt-1 text-xl font-semibold text-text">{formatCount(metric.current)}</p>
      <div className="mt-1">
        <ChangeBadge pct={metric.pct_change} />
      </div>
    </div>
  );
}

export default function AveragesRow({ averages }: { averages: AveragesRowData }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-text">
        Last 30 days <span className="text-faint font-normal">vs. prior 30</span>
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <AverageCell label="Avg. views" metric={averages.views} />
        <AverageCell label="Avg. likes" metric={averages.likes} />
        <AverageCell label="Avg. saves" metric={averages.saves} />
        <AverageCell label="Avg. shares" metric={averages.shares} />
      </div>
    </section>
  );
}
