"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  Check,
  Video,
  VideoOff,
  Circle,
  Square,
  Maximize,
  Minimize,
  Smartphone,
  Download,
} from "lucide-react";
import { markFilmedAction } from "@/app/session-mode/actions";
import { useRecorder } from "./useRecorder";

export interface QueuedScriptItem {
  id: number;
  hook: string;
  body: string;
}

const SETTINGS_KEY = "content-studio.prompter";

export default function Teleprompter({ scripts }: { scripts: QueuedScriptItem[] }) {
  const [remaining, setRemaining] = useState(scripts);
  const [index, setIndex] = useState(0);
  // Settings he dials in once and should not have to dial in again.
  // Read after mount, never during render: the server has no
  // localStorage, so reading it inline makes the two passes disagree.
  const [speed, setSpeed] = useState(40); // px / second
  const [textSize, setTextSize] = useState(32); // px
  const [playing, setPlaying] = useState(false);
  const [isPending, setIsPending] = useState(false);
  // How much the video is dimmed behind the words. White text on a bright
  // window or a pale shirt is unreadable, and the right amount depends
  // entirely on where someone is filming, so it is a control, not a guess.
  const [scrim, setScrim] = useState(0.45);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  // Accumulated scroll position as a float. We assign this whole value
  // to scrollTop every frame rather than doing `scrollTop += delta`:
  // scrollTop is stored as an integer by the browser, so incrementing it
  // directly truncates the sub-pixel remainder every single frame and
  // the scroll stalls out completely at low speeds. Keeping our own
  // float accumulator and re-assigning the running total avoids that.
  const scrollPosRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null");
      if (typeof saved?.speed === "number") setSpeed(saved.speed);
      if (typeof saved?.textSize === "number") setTextSize(saved.textSize);
      if (typeof saved?.scrim === "number") setScrim(saved.scrim);
    } catch {
      // Private browsing, a cleared store, or nonsense in the slot. The
      // defaults are fine; losing a setting is not worth a broken page.
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ speed, textSize, scrim }));
    } catch {
      /* storage full or refused; the prompter still works */
    }
  }, [speed, textSize, scrim]);

  const current = remaining[index] as QueuedScriptItem | undefined;

  const slug = (current?.hook || "take")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "take";
  const stamp = new Date().toISOString().slice(0, 10);
  const camera = useRecorder(`content-studio-${slug}-${stamp}`);

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

  // Filming wants the whole screen: the app's sidebar is both a distraction
  // and about a fifth of the width that the words could be using.
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await shellRef.current?.requestFullscreen();
      }
    } catch {
      // Refused (iPhone Safari does not allow it on arbitrary elements).
      // The prompter still works, just windowed.
    }
  }

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

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
        <p className="max-w-md text-sm text-faint">
          Two ways to fill this. Write a reel or a short on the{" "}
          <a href="/ideas" className="text-accent hover:underline">
            Ideas
          </a>{" "}
          page and press Send to Session Mode on the draft, or write one
          straight from{" "}
          <a href="/scripts" className="text-accent hover:underline">
            Script Writer
          </a>{" "}
          and save it to the queue.
        </p>
      </div>
    );
  }

  const cameraOn = camera.state === "on";

  return (
    <div ref={shellRef} className="flex h-screen flex-col bg-bg">
      <div className="relative min-h-0 flex-1">
        {/* The camera, underneath everything. Mirrored for the person
            reading; the recording itself is not flipped. */}
        <video
          ref={camera.videoRef}
          playsInline
          muted
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
            cameraOn ? "opacity-100" : "opacity-0"
          }`}
          style={{ transform: "scaleX(-1)" }}
        />
        {/* Dimmer, so the words stay readable over whatever is behind them. */}
        {cameraOn && (
          <div
            className="absolute inset-0 bg-black transition-opacity"
            style={{ opacity: scrim }}
          />
        )}

        {camera.state === "error" && camera.error && (
          <div className="absolute inset-x-0 top-0 z-20 p-4">
            <p className="mx-auto max-w-md rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-center text-sm text-warn">
              {camera.error}
            </p>
          </div>
        )}

        {camera.recording && (
          <div className="absolute right-4 top-4 z-20 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
            <span className="font-mono text-sm text-white">
              {Math.floor(camera.elapsed / 60)}:
              {String(camera.elapsed % 60).padStart(2, "0")}
            </span>
          </div>
        )}

        {/* Prompter text -- NO smooth-scroll behavior on this container.
            Smooth-scroll behavior turns every frame's scrollTop assignment
            into its own competing CSS animation, fighting the rAF loop. */}
        <div
          ref={containerRef}
          className="absolute inset-0 overflow-y-auto px-6 py-16 sm:px-16"
        >
          <div className="mx-auto max-w-3xl">
            <p
              className={`font-semibold ${cameraOn ? "text-white" : "text-text"}`}
              style={{
                fontSize: textSize * 1.3,
                textShadow: cameraOn ? "0 2px 12px rgba(0,0,0,0.9)" : undefined,
              }}
            >
              {current.hook}
            </p>
            <p
              className={`mt-8 whitespace-pre-wrap leading-relaxed ${
                cameraOn ? "text-white" : "text-text"
              }`}
              style={{
                fontSize: textSize,
                textShadow: cameraOn ? "0 2px 12px rgba(0,0,0,0.9)" : undefined,
              }}
            >
              {current.body}
            </p>
            <div style={{ height: "60vh" }} />
          </div>
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

          {cameraOn && (
            <label className="flex items-center gap-2 text-xs text-faint">
              Dim
              <input
                type="range"
                min={0}
                max={0.9}
                step={0.05}
                value={scrim}
                onChange={(e) => setScrim(Number(e.target.value))}
                className="w-24 accent-[var(--accent)]"
              />
            </label>
          )}

          {camera.supported && (
            <button
              type="button"
              onClick={cameraOn ? camera.stopCamera : camera.startCamera}
              disabled={camera.state === "starting"}
              className="flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
            >
              {cameraOn ? <VideoOff size={14} /> : <Video size={14} />}
              {camera.state === "starting"
                ? "Starting"
                : cameraOn
                  ? "Camera off"
                  : "Camera"}
            </button>
          )}

          <button
            type="button"
            onClick={toggleFullscreen}
            className="flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs text-muted transition-colors hover:border-accent hover:text-accent"
          >
            {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
            {isFullscreen ? "Exit full screen" : "Full screen"}
          </button>

          {cameraOn && (
            <button
              type="button"
              onClick={() => {
                if (camera.recording) {
                  camera.stopRecording();
                  setPlaying(false);
                } else {
                  // Rewind to the top so the take starts at the hook, and
                  // start the scroll with it: pressing record and then
                  // having to press play is how you get three seconds of
                  // silence at the front of every clip.
                  scrollPosRef.current = 0;
                  if (containerRef.current) containerRef.current.scrollTop = 0;
                  lastTimeRef.current = null;
                  camera.startRecording();
                  setPlaying(true);
                }
              }}
              className={`flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-medium ${
                camera.recording
                  ? "bg-red-500 text-white"
                  : "border border-red-500/50 text-red-400 hover:bg-red-500/10"
              }`}
            >
              {camera.recording ? <Square size={13} /> : <Circle size={13} />}
              {camera.recording ? "Stop and save" : "Record"}
            </button>
          )}

          {camera.take && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-accent">
                Take saved, {camera.take.mb} MB
              </span>
              {camera.canShareTake ? (
                <button
                  type="button"
                  onClick={camera.shareTake}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-accent px-3 text-xs font-medium text-accent"
                >
                  <Smartphone size={13} /> Save to my photos
                </button>
              ) : (
                <button
                  type="button"
                  onClick={camera.downloadTake}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-muted hover:border-accent hover:text-accent"
                >
                  <Download size={13} /> Save again
                </button>
              )}
              <button
                type="button"
                onClick={camera.clearTake}
                className="text-xs text-faint underline underline-offset-2 hover:text-warn"
              >
                Discard
              </button>
            </div>
          )}

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
