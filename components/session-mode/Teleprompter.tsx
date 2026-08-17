"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Play, Pause, Check } from "lucide-react";
import { markFilmedAction } from "@/app/session-mode/actions";

export interface QueuedScriptItem {
  id: number;
  hook: string;
  body: string;
}

export default function Teleprompter({ scripts }: { scripts: QueuedScriptItem[] }) {
  const [remaining, setRemaining] = useState(scripts);
  const [index, setIndex] = useState(0);
  const [speed, setSpeed] = useState(40); // px / second
  const [textSize, setTextSize] = useState(32); // px
  const [playing, setPlaying] = useState(false);
  const [isPending, setIsPending] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  // Accumulated scroll position as a float. We assign this whole value
  // to scrollTop every frame rather than doing `scrollTop += delta`:
  // scrollTop is stored as an integer by the browser, so incrementing it
  // directly truncates the sub-pixel remainder every single frame and
  // the scroll stalls out completely at low speeds. Keeping our own
  // float accumulator and re-assigning the running total avoids that.
  const scrollPosRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  const current = remaining[index] as QueuedScriptItem | undefined;

  // Reset scroll position when switching scripts.
  useEffect(() => {
    scrollPosRef.current = 0;
    if (containerRef.current) containerRef.current.scrollTop = 0;
    lastTimeRef.current = null;
  }, [index]);

  useEffect(() => {
    if (!playing) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      lastTimeRef.current = null;
      return;
    }

    function tick(time: number) {
      if (lastTimeRef.current === null) lastTimeRef.current = time;
      const deltaSeconds = (time - lastTimeRef.current) / 1000;
      lastTimeRef.current = time;

      scrollPosRef.current += speed * deltaSeconds;
      const el = containerRef.current;
      if (el) {
        el.scrollTop = scrollPosRef.current;
        // Stop auto-scrolling once we hit the bottom.
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) {
          setPlaying(false);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, speed]);

  function goNext() {
    setPlaying(false);
    setIndex((i) => Math.min(i + 1, remaining.length - 1));
  }
  function goPrev() {
    setPlaying(false);
    setIndex((i) => Math.max(i - 1, 0));
  }

  async function markFilmed() {
    if (!current) return;
    setIsPending(true);
    await markFilmedAction(current.id);
    setIsPending(false);
    setRemaining((prev) => {
      const next = prev.filter((s) => s.id !== current.id);
      setIndex((i) => Math.min(i, Math.max(next.length - 1, 0)));
      return next;
    });
    setPlaying(false);
  }

  if (!current) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 bg-bg p-8 text-center">
        <p className="text-lg text-text">Nothing queued.</p>
        <p className="text-sm text-faint">
          Save a script to the queue from Script Writer to fill this up.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-bg">
      {/* Prompter text -- NO smooth-scroll behavior on this container.
          Smooth-scroll behavior turns every frame's scrollTop assignment
          into its own competing CSS animation, fighting the rAF loop. */}
      <div ref={containerRef} className="flex-1 overflow-y-auto px-6 py-16 sm:px-16">
        <div className="mx-auto max-w-3xl">
          <p
            className="font-semibold text-text"
            style={{ fontSize: textSize * 1.3 }}
          >
            {current.hook}
          </p>
          <p
            className="mt-8 whitespace-pre-wrap leading-relaxed text-text"
            style={{ fontSize: textSize }}
          >
            {current.body}
          </p>
          <div style={{ height: "60vh" }} />
        </div>
      </div>

      {/* Controls */}
      <div className="shrink-0 border-t border-border bg-panel px-4 py-3">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-bg"
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause size={18} /> : <Play size={18} />}
          </button>

          <button
            type="button"
            onClick={goPrev}
            disabled={index === 0}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted disabled:opacity-30"
            aria-label="Previous"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={index >= remaining.length - 1}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted disabled:opacity-30"
            aria-label="Next"
          >
            <ChevronRight size={16} />
          </button>

          <label className="flex items-center gap-2 text-xs text-faint">
            Speed
            <input
              type="range"
              min={5}
              max={150}
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="w-24 accent-[var(--accent)]"
            />
          </label>

          <label className="flex items-center gap-2 text-xs text-faint">
            Size
            <input
              type="range"
              min={18}
              max={56}
              value={textSize}
              onChange={(e) => setTextSize(Number(e.target.value))}
              className="w-24 accent-[var(--accent)]"
            />
          </label>

          <button
            type="button"
            onClick={markFilmed}
            disabled={isPending}
            className="ml-auto inline-flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-sm text-accent disabled:opacity-50"
          >
            <Check size={14} /> Mark filmed
          </button>

          <span className="text-xs text-faint">
            {index + 1} / {remaining.length}
          </span>
        </div>
      </div>
    </div>
  );
}
