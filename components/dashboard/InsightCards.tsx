import { TrendingUp, TriangleAlert, Lightbulb } from "lucide-react";
import type { InsightCard } from "@/lib/queries";

const KIND_STYLES: Record<
  string,
  { border: string; bg: string; icon: typeof TrendingUp; iconColor: string; label: string }
> = {
  win: {
    border: "border-accent/30",
    bg: "bg-accent/10",
    icon: TrendingUp,
    iconColor: "text-accent",
    label: "Win",
  },
  warning: {
    border: "border-warn/30",
    bg: "bg-warn/10",
    icon: TriangleAlert,
    iconColor: "text-warn",
    label: "Warning",
  },
  idea: {
    border: "border-idea/30",
    bg: "bg-idea/10",
    icon: Lightbulb,
    iconColor: "text-idea",
    label: "Idea",
  },
};

export default function InsightCards({ insights }: { insights: InsightCard[] }) {
  if (insights.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-text">AI insights</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {insights.map((insight) => {
          const style = KIND_STYLES[insight.kind] ?? KIND_STYLES.idea;
          const Icon = style.icon;
          return (
            <div
              key={insight.id}
              className={`rounded-lg border ${style.border} ${style.bg} p-4`}
            >
              <div className="mb-2 flex items-center gap-2">
                <Icon size={15} className={style.iconColor} />
                <span className={`text-xs font-medium uppercase tracking-wide ${style.iconColor}`}>
                  {style.label}
                </span>
              </div>
              <p className="text-sm text-text">{insight.content}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
