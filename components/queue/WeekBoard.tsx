"use client";

import { useState, useTransition } from "react";
import { Check, X, Plus, Undo2 } from "lucide-react";
import {
  scheduleAction,
  unscheduleAction,
  setPostedAction,
} from "@/app/this-week/actions";
import { formatLabel } from "@/lib/ideas/formats";

interface Item {
  ideaId: number;
  format: string;
  title: string;
  hook: string | null;
  scheduledFor: string | null;
  slot: string | null;
  postedAt: string | null;
}

interface Slot {
  id: string;
  label: string;
  when: string;
}

/**
 * The week, as two decisions a day.
 *
 * Not a calendar. A calendar asks what time, and what time is a question
 * he already answered: his posting rules name a midday window and an
 * evening one, verified against his own numbers. Offering a free choice
 * of hour would be offering him the chance to get it wrong.
 *
 * Empty slots are buttons rather than drop targets. Drag and drop is
 * nicer on a desktop and unusable on the phone he actually posts from.
 */
export default function WeekBoard({
  days,
  today,
  slots,
  scheduled,
  ready,
  posted,
}: {
  days: string[];
  today: string;
  slots: Slot[];
  scheduled: Item[];
  ready: Item[];
  posted: Item[];
}) {
  const [isPending, startTransition] = useTransition();
  const [picking, setPicking] = useState<{ day: string; slot: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const at = (day: string, slot: string) =>
    scheduled.find((s) => s.scheduledFor === day && s.slot === slot) ?? null;

  const todaysPosts = scheduled.filter((s) => s.scheduledFor === today);

  function put(item: Item, day: string, slot: string) {
    setError(null);
    startTransition(async () => {
      const res = await scheduleAction({
        ideaId: item.ideaId,
        format: item.format,
        day,
        slot,
      });
      if (!res.ok) setError(res.reason ?? "Could not put it there.");
      setPicking(null);
    });
  }

  return (
    <div className="space-y-6">
      {/* Today first. On most mornings this is the only part he needs. */}
      <div className="rounded-xl border border-accent/40 bg-accent/5 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-accent">Today</p>
        {todaysPosts.length === 0 ? (
          <p className="mt-1 text-sm text-muted">
            Nothing scheduled for today. Put something in a slot below, or take
            the day off on purpose rather than by accident.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {todaysPosts.map((p) => (
              <li key={`${p.ideaId}-${p.format}`} className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[11px] text-accent">
                  {slots.find((s) => s.id === p.slot)?.when ?? p.slot}
                </span>
                <span className="text-sm text-text">{p.hook || p.title}</span>
                <span className="text-[11px] text-faint">{formatLabel(p.format)}</span>
                <button
                  type="button"
                  onClick={() =>
                    startTransition(async () => {
                      await setPostedAction(p.ideaId, p.format, true);
                    })
                  }
                  disabled={isPending}
                  className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-[11px] text-accent disabled:opacity-50"
                >
                  <Check size={11} strokeWidth={2.5} /> Posted it
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <p className="text-xs text-warn">{error}</p>}

      {/* The week. */}
      <div className="space-y-2">
        {days.map((day) => (
          <div
            key={day}
            className={`rounded-xl border p-3 ${
              day === today ? "border-accent/40 bg-panel" : "border-border bg-panel"
            }`}
          >
            <p className="text-xs font-medium text-text">
              {dayLabel(day, today)}
              <span className="ml-2 font-normal text-faint">{day}</span>
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {slots.map((slot) => {
                const item = at(day, slot.id);
                const isPicking = picking?.day === day && picking?.slot === slot.id;
                return (
                  <div
                    key={slot.id}
                    className="rounded-lg border border-border bg-panel-2 p-2"
                  >
                    <p className="text-[11px] text-faint">
                      {slot.label}, {slot.when}
                    </p>
                    {item ? (
                      <div className="mt-1 space-y-1">
                        <p className="text-xs text-text">{item.hook || item.title}</p>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] text-faint">
                            {formatLabel(item.format)}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              startTransition(async () => {
                                await setPostedAction(item.ideaId, item.format, true);
                              })
                            }
                            disabled={isPending}
                            className="inline-flex items-center gap-1 rounded-full border border-accent/40 px-2 py-0.5 text-[11px] text-accent disabled:opacity-50"
                          >
                            <Check size={10} strokeWidth={2.5} /> Posted
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              startTransition(async () => {
                                await unscheduleAction(item.ideaId, item.format);
                              })
                            }
                            disabled={isPending}
                            className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-faint hover:border-warn hover:text-warn disabled:opacity-50"
                          >
                            <X size={10} strokeWidth={2.5} /> Take out
                          </button>
                        </div>
                      </div>
                    ) : isPicking ? (
                      <div className="mt-1 space-y-1">
                        {ready.length === 0 ? (
                          <p className="text-[11px] text-faint">
                            Nothing finished and waiting. Write something on the
                            Ideas page first.
                          </p>
                        ) : (
                          // Every waiting draft, in a box that scrolls. This
                          // used to show the first eight, which quietly made
                          // the ninth impossible to schedule at all: not
                          // hidden behind a "show more", simply absent, with
                          // nothing on screen to say so.
                          <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
                            {ready.map((r) => (
                              <button
                                key={`${r.ideaId}-${r.format}`}
                                type="button"
                                onClick={() => put(r, day, slot.id)}
                                disabled={isPending}
                                className="block w-full truncate rounded border border-border px-2 py-1 text-left text-[11px] text-muted hover:border-accent hover:text-accent disabled:opacity-50"
                              >
                                {formatLabel(r.format)}: {r.hook || r.title}
                              </button>
                            ))}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => setPicking(null)}
                          className="text-[11px] text-faint underline underline-offset-2"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setError(null);
                          setPicking({ day, slot: slot.id });
                        }}
                        className="mt-1 inline-flex items-center gap-1 text-[11px] text-faint hover:text-accent"
                      >
                        <Plus size={11} strokeWidth={2} /> Put something here
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* What is finished and has nowhere to be. */}
      <div>
        <p className="text-xs font-medium text-text">
          Finished and waiting
          <span className="ml-2 font-normal text-faint">{ready.length}</span>
        </p>
        {ready.length === 0 ? (
          <p className="mt-1 text-xs text-faint">
            Nothing waiting. Everything you have written is either scheduled or
            already out.
          </p>
        ) : (
          <ul className="mt-2 space-y-1">
            {ready.map((r) => (
              <li
                key={`${r.ideaId}-${r.format}`}
                className="rounded-lg border border-border bg-panel p-2 text-xs text-muted"
              >
                <span className="text-faint">{formatLabel(r.format)}</span>{" "}
                {r.hook || r.title}
              </li>
            ))}
          </ul>
        )}
      </div>

      {posted.length > 0 && (
        <div>
          <p className="text-xs font-medium text-text">Gone out</p>
          <ul className="mt-2 space-y-1">
            {posted.map((p) => (
              <li
                key={`${p.ideaId}-${p.format}`}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-panel p-2 text-xs text-faint"
              >
                <Check size={11} strokeWidth={2.5} className="text-accent" />
                <span className="truncate">{p.hook || p.title}</span>
                <span>{p.postedAt?.slice(0, 10)}</span>
                <button
                  type="button"
                  onClick={() =>
                    startTransition(async () => {
                      await setPostedAction(p.ideaId, p.format, false);
                    })
                  }
                  disabled={isPending}
                  title="Put it back in the queue"
                  className="ml-auto inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 hover:border-accent hover:text-accent disabled:opacity-50"
                >
                  <Undo2 size={10} strokeWidth={2} /> Not actually
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Today, Tomorrow, then the weekday name.
 *
 * Built from the date string in UTC rather than a local Date, because
 * new Date("2026-11-09") is midnight UTC and reading its weekday in a
 * western timezone gives you the day before.
 */
function dayLabel(day: string, today: string): string {
  if (day === today) return "Today";
  const [y, m, d] = day.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  const diff =
    (Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86_400_000;
  if (diff === 1) return "Tomorrow";
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    weekday: "long",
    timeZone: "UTC",
  });
}
