import { getRecentInsights } from "@/lib/queries";
import InsightCards from "@/components/dashboard/InsightCards";
import RegenerateButton from "@/components/patterns/RegenerateButton";

export default async function PatternsPage() {
  const insights = await getRecentInsights();

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-text">Pattern Reader</h1>
          <p className="mt-1 text-sm text-muted">
            Cross-library patterns pulled from your own post history.
          </p>
        </div>
        <RegenerateButton />
      </div>

      {insights.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-sm text-faint">
          No patterns generated yet. Hit regenerate to analyze your history.
        </div>
      ) : (
        <InsightCards insights={insights} />
      )}
    </div>
  );
}
