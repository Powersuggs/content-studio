import { CalendarDays } from "lucide-react";
import {
  getScheduled,
  getReadyToPost,
  getRecentlyPosted,
  today,
  SLOTS,
} from "@/lib/queue/queries";
import SetupNotice from "@/components/SetupNotice";
import { safeLoad } from "@/lib/db-errors";
import WeekBoard from "@/components/queue/WeekBoard";

export const dynamic = "force-dynamic";

/** Seven days starting today, as plain YYYY-MM-DD strings. */
function weekFrom(start: string): string[] {
  const days: string[] = [];
  const [y, m, d] = start.split("-").map(Number);
  for (let i = 0; i < 7; i++) {
    // Built in UTC from calendar parts, never from a local Date, so the
    // day never slides by one near midnight.
    const t = new Date(Date.UTC(y, m - 1, d + i));
    days.push(t.toISOString().slice(0, 10));
  }
  return days;
}

export default async function ThisWeekPage() {
  const [todayStr, dateError] = await safeLoad(
    () => today(),
    new Date().toISOString().slice(0, 10),
    "this-week",
  );
  const [scheduled, scheduleError] = await safeLoad(() => getScheduled(), [], "this-week");
  const [ready] = await safeLoad(() => getReadyToPost(), [], "this-week");
  const [posted] = await safeLoad(() => getRecentlyPosted(8), [], "this-week");

  const setupError = scheduleError ?? dateError;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
      {setupError && <SetupNotice message={setupError} />}

      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-text">
          <CalendarDays size={18} strokeWidth={1.75} className="text-accent" />
          This Week
        </h1>
        <p className="mt-1 text-sm text-muted">
          What goes out, and when. The two windows are the ones from your own
          posting rules: {SLOTS.map((s) => `${s.label.toLowerCase()} ${s.when}`).join(", and ")}.
          Nothing here posts for you. It decides the order so you do not have to
          decide it every morning.
        </p>
      </div>

      {!setupError && (
        <WeekBoard
          days={weekFrom(todayStr)}
          today={todayStr}
          slots={SLOTS.map((s) => ({ id: s.id, label: s.label, when: s.when }))}
          scheduled={scheduled}
          ready={ready}
          posted={posted}
        />
      )}
    </div>
  );
}
