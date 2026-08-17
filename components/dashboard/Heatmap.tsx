"use client";

import { useEffect, useMemo, useRef } from "react";
import type { HeatmapDay } from "@/lib/queries";

const WEEKDAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""]; // Sun..Sat, sparse like GitHub
const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function parseLocalDay(day: string): { y: number; m: number; d: number; date: Date } {
  const [y, m, d] = day.split("-").map(Number);
  // Constructed from explicit local calendar parts -- never from
  // toISOString() -- so weekday/month derivation stays in local time.
  return { y, m, d, date: new Date(y, m - 1, d) };
}

function countColor(count: number): string {
  if (count <= 0) return "bg-panel-2";
  if (count === 1) return "bg-accent/30";
  if (count === 2) return "bg-accent/55";
  return "bg-accent/85";
}

export default function Heatmap({ days }: { days: HeatmapDay[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const { weeks, monthMarkers } = useMemo(() => {
    if (days.length === 0) return { weeks: [] as HeatmapDay[][], monthMarkers: [] as { weekIndex: number; label: string }[] };

    const first = parseLocalDay(days[0].day);
    // Pad the front of the grid back to the preceding Sunday so every
    // column is a full 7-day week (Sun..Sat), matching WEEKDAY_LABELS.
    const leadingEmpty = first.date.getDay();
    const padded: (HeatmapDay | null)[] = [
      ...Array.from({ length: leadingEmpty }, () => null),
      ...days,
    ];

    const weeks: (HeatmapDay | null)[][] = [];
    for (let i = 0; i < padded.length; i += 7) {
      weeks.push(padded.slice(i, i + 7));
    }

    const monthMarkers: { weekIndex: number; label: string }[] = [];
    let lastMonth = -1;
    weeks.forEach((week, weekIndex) => {
      const firstRealDay = week.find((d) => d !== null);
      if (!firstRealDay) return;
      const { m } = parseLocalDay(firstRealDay.day);
      if (m !== lastMonth) {
        monthMarkers.push({ weekIndex, label: MONTH_ABBR[m - 1] });
        lastMonth = m;
      }
    });

    return { weeks: weeks as HeatmapDay[][], monthMarkers };
  }, [days]);

  // Anchor horizontal scroll to the most recent weeks (right edge).
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [weeks]);

  if (weeks.length === 0) {
    return (
      <section>
        <h2 className="mb-3 text-sm font-semibold text-text">Posting activity</h2>
        <div className="rounded-xl border border-dashed border-border p-6 text-sm text-faint">
          No posting history yet.
        </div>
      </section>
    );
  }

  const cell = "h-5 w-5 shrink-0";

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-text">Posting activity</h2>
      <div className="rounded-xl border border-border bg-panel p-4">
        <div ref={scrollRef} className="overflow-x-auto">
          <div className="inline-flex flex-col gap-1">
            {/* Month labels */}
            <div className="ml-8 flex gap-1">
              {weeks.map((_, weekIndex) => {
                const marker = monthMarkers.find((m) => m.weekIndex === weekIndex);
                return (
                  <div key={weekIndex} className={`${cell} text-[10px] text-faint`}>
                    {marker ? marker.label : ""}
                  </div>
                );
              })}
            </div>

            <div className="flex gap-1">
              {/* Weekday labels */}
              <div className="flex w-8 shrink-0 flex-col gap-1">
                {WEEKDAY_LABELS.map((label, i) => (
                  <div key={i} className="flex h-5 items-center text-[10px] text-faint">
                    {label}
                  </div>
                ))}
              </div>

              {/* Week columns */}
              <div className="flex gap-1">
                {weeks.map((week, weekIndex) => (
                  <div key={weekIndex} className="flex flex-col gap-1">
                    {week.map((dayCell, dayIndex) =>
                      dayCell ? (
                        <div
                          key={dayCell.day}
                          title={`${dayCell.day}: ${dayCell.count} post${dayCell.count === 1 ? "" : "s"}`}
                          className={`${cell} flex items-center justify-center rounded-[3px] text-[9px] leading-none text-text/80 ${countColor(dayCell.count)}`}
                        >
                          {dayCell.count > 0 ? dayCell.count : ""}
                        </div>
                      ) : (
                        <div key={`empty-${weekIndex}-${dayIndex}`} className={cell} />
                      ),
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
