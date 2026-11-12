"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fitFrame, showsReelGuide } from "@/lib/session/framing";
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
  SlidersHorizontal,
  Film,
  ArrowLeft,
} from "lucide-react";
import { markFilmedAction, unfilmScriptAction } from "@/app/session-mode/actions";
import { useRecorder, type Take } from "./useRecorder";
import { chunkScript } from "@/lib/session/chunks";
import ReviewPanel from "./ReviewPanel";

export interface QueuedScriptItem {
  id: number;
  hook: string;
  body: string;
}

const SETTINGS_KEY = "content-studio.prompter";

export interface FilmedScript {
  id: number;
  hook: string;
}

export default function Teleprompter({
  scripts,
  filmed = [],
}: {
  scripts: QueuedScriptItem[];
  /** Already marked done, so Done can be taken back. */
  filmed?: FilmedScript[];
}) {
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
  const [showSettings, setShowSettings] = useState(false);
  /**
   * How the script is shown.
   *
   * "scroll" is a moving wall of text, which works when you can keep
   * your eyes on it. Filming, you cannot: you are on the lens, glancing
   * down, finding your place again. "lines" holds a couple of lines
   * still until you have said them, which is what every prompter built
   * for a phone does.
   */
  const [mode, setMode] = useState<"scroll" | "lines">("scroll");
  /**
   * Running from an icon on the home screen rather than in the browser.
   *
   * On an iPhone that is a stripped-down context where saving a file can
   * quietly do nothing, which is exactly what happened to Aaron: he
   * pressed save, nothing appeared, and the take went nowhere. Worth
   * saying before he films rather than after.
   */
  const [standalone, setStandalone] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [chunk, setChunk] = useState(0);
  /** Words a minute, the pace in lines mode. Speed means something else there. */

  const containerRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const cameraAreaRef = useRef<HTMLDivElement>(null);
  const [areaSize, setAreaSize] = useState({ width: 0, height: 0 });

  /*
   * Watch the space the camera gets, so the preview can be drawn at the
   * camera's true shape inside it.
   *
   * Done in JavaScript rather than CSS because "fit a box of a known shape
   * inside a box of an unknown shape" has no reliable pure-CSS form, and
   * getting it slightly wrong here means cropping the preview again, which
   * is the exact bug this is fixing.
   */
  useEffect(() => {
    const el = cameraAreaRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () =>
      setAreaSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
      if (saved?.mode === "lines" || saved?.mode === "scroll") setMode(saved.mode);
    } catch {
      // Private browsing, a cleared store, or nonsense in the slot. The
      // defaults are fine; losing a setting is not worth a broken page.
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({ speed, textSize, scrim, mode }),
      );
    } catch {
      /* storage full or refused; the prompter still works */
    }
  }, [speed, textSize, scrim, mode]);

  const current = remaining[index] as QueuedScriptItem | undefined;
  const chunks = useMemo(
    () => chunkScript(current?.hook ?? "", current?.body ?? ""),
    [current?.hook, current?.body],
  );

  const slug = (current?.hook || "take")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "take";
  const stamp = new Date().toISOString().slice(0, 10);
  const camera = useRecorder(`content-studio-${slug}-${stamp}`);

  /**
   * The preview rectangle: the biggest box of the camera's shape that fits
   * in the space available. Letterboxed rather than cropped, so the edges
   * of the picture he is framing himself against are the edges of the
   * picture being recorded. Arithmetic in lib/session/framing.ts, where
   * scripts/test-framing.mjs can check it.
   */
  const frame = useMemo(() => {
    const fitted = fitFrame(areaSize.width, areaSize.height, camera.aspect);
    return fitted.width
      ? { width: fitted.width, height: fitted.height }
      : { width: "100%", height: "100%" };
  }, [areaSize, camera.aspect]);

  // Back to the top when switching scripts, whichever way it is shown.
  useEffect(() => {
    scrollPosRef.current = 0;
    if (containerRef.current) containerRef.current.scrollTop = 0;
    lastTimeRef.current = null;
    setChunk(0);
  }, [index]);

  /**
   * Advancing the lines on their own while playing.
   *
   * Each line is held for as long as it takes to say, which is a count
   * of its words rather than its characters: six short words is not half
   * the work of six long ones. It stops at the last line rather than
   * looping, because looping during a take is how you lose your place.
   */
  /*
   * A few lines at a time does NOT move on by itself.
   *
   * Aaron: "the single lines automatically push to the next one without
   * me clicking the screen for next ... we need to make sure if i am
   * selecting a few lines it goes to the next one when i click the
   * screen". It used to run on a timer worked out from the word count,
   * which meant the words moved while he was still saying them and the
   * only way to keep up was to race the clock.
   *
   * The two modes now mean two different things, which is the point of
   * having both. Scrolling paces itself and he reads along. A few lines
   * waits for him, every time, and the whole screen is the button.
   */

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

  /*
   * Whether this browser will go full screen at all.
   *
   * Aaron: "the box next to the camera on and off button does nothing".
   * It did nothing on his phone and the code already knew why, with a
   * comment saying iPhone Safari refuses it, and showed the button
   * anyway. A control that is documented not to work is worse than no
   * control: he pressed it, nothing happened, and the only thing he
   * learned was not to trust the buttons.
   *
   * It also matters much less than it did. The reason for it was to
   * escape the app's sidebar while filming, and filming has no sidebar
   * any more.
   */
  const [canFullscreen, setCanFullscreen] = useState(false);
  useEffect(() => {
    setCanFullscreen(
      typeof document !== "undefined" &&
        document.fullscreenEnabled === true &&
        typeof document.documentElement.requestFullscreen === "function",
    );
  }, []);

  // Filming wants the whole screen, where a browser allows it.
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
    try {
      const iosStandalone = (window.navigator as unknown as { standalone?: boolean })
        .standalone === true;
      const displayMode = window.matchMedia("(display-mode: standalone)").matches;
      setStandalone(iosStandalone || displayMode);
    } catch {
      setStandalone(false);
    }
  }, []);

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
      <div className="flex h-app flex-col bg-bg">
        {/*
         * A way out.
         *
         * Aaron: "after the done on a recording when it goes to the put
         * it back section there is no button to go back into the site at
         * all". Pressing Done on the last queued script lands here, and
         * this screen had no menu, because filming deliberately has none,
         * and no back button, because I only put one on the filming
         * screen. The only exits were two words inside a paragraph.
         */}
        <div className="flex shrink-0 items-center border-b border-border px-3 py-3">
          <a
            href="/dashboard"
            className="flex h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-muted"
          >
            <ArrowLeft size={16} /> Back to Content Studio
          </a>
        </div>
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 overflow-y-auto p-8 text-center">
        <p className="text-lg text-text">Nothing queued.</p>
        {filmed.length > 0 && (
          <div className="w-full max-w-md space-y-2 rounded-xl border border-border bg-panel p-3 text-left">
            <p className="text-xs text-muted">
              These are marked done. Pressing Done hides a script from here, it
              does not delete it. Put one back if you pressed it by mistake.
            </p>
            {filmed.map((f) => (
              <PutBack key={f.id} script={f} />
            ))}
          </div>
        )}
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
      </div>
    );
  }

  const cameraOn = camera.state === "on";

  return (
    <div ref={shellRef} className="relative flex h-app flex-col overflow-hidden bg-bg">
      {reviewing && (
        <ReviewPanel
          takes={camera.takes}
          canShare={camera.canShareTake}
          saveNote={camera.saveNote}
          onSave={camera.saveTake}
          onSaveUncut={camera.saveUncut}
          onRemove={camera.removeTake}
          onMove={camera.moveTake}
          onEdited={camera.addTake}
          onClose={() => setReviewing(false)}
        />
      )}
      <div ref={cameraAreaRef} className="relative min-h-0 flex-1">
        {/* The camera, underneath everything. Mirrored for the person
            reading; the recording itself is not flipped.

            Held at the camera's own shape rather than stretched to fill
            this box. The box is taller than any camera frame, so filling
            it meant cropping the sides off the preview, so he was framing
            himself against a picture 22% narrower than the one being
            recorded. Whatever is left over goes black, and the words sit
            over that quite happily. */}
        {/* Top, not middle.
            Aaron: "the camera is mid phone screen i need everything up at
            the top so it doesnt look like im lookding down when i am
            reading". The lens is at the top of the phone, so anything he
            looks at belongs as near to it as it can get. Reading from the
            middle of the screen puts his eyes below the lens in every
            take, and on the finished video that reads as not quite looking
            at you. */}
        <div className="absolute inset-0 flex items-start justify-center overflow-hidden">
          <div
            className="relative"
            style={{ width: frame.width, height: frame.height }}
          >
            <video
              ref={camera.videoRef}
              playsInline
              muted
              className={`h-full w-full object-cover transition-opacity duration-300 ${
                cameraOn ? "opacity-100" : "opacity-0"
              }`}
              style={{ transform: "scaleX(-1)" }}
            />
            {/* What a reel keeps, when the camera insists on giving more
                than one. Normally it does not any more, because the camera
                is asked for a reel shape from the start. */}
            {cameraOn && showsReelGuide(camera.aspect) && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="aspect-[9/16] h-full border-x border-dashed border-white/35" />
              </div>
            )}
            {/* A tick at the top middle, to line himself up against.
                The dotted lines above do the rest: "the dotted lines
                should guide me to be center". They are a guide now and
                nothing more, since the whole frame is kept. */}
            {cameraOn && (
              <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center">
                <div className="h-5 w-px bg-white/40" />
              </div>
            )}
          </div>
        </div>
        {/* Dimmer, so the words stay readable over whatever is behind them. */}
        {cameraOn && (
          <div
            className="absolute inset-0 bg-black transition-opacity"
            style={{ opacity: scrim }}
          />
        )}

        {/* The way out. This screen has no nav bar of its own any more:
            a hamburger menu is no use while filming, and on a phone it was
            stacked on top of a full-height screen and pushed the record
            button off the bottom. Hidden while rolling, because the only
            thing worse than no way out is losing a take to a stray thumb. */}
        {!camera.recording && (
          <a
            href="/dashboard"
            aria-label="Leave Session Mode"
            className="absolute left-3 top-3 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white/80"
          >
            <ArrowLeft size={18} />
          </a>
        )}

        {standalone && (
          <div className="absolute inset-x-0 top-0 z-20 p-3">
            <p className="mx-auto max-w-md rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-center text-xs text-warn">
              You opened this from a home screen icon. Saving a video often
              does nothing in that mode. Open the site in your normal browser
              before you film.
            </p>
          </div>
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
            {/* Grey and still while it is cutting, so there is never a
                doubt about whether the last thing said was recorded. */}
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                camera.cutting || camera.paused
                  ? "bg-white/40"
                  : "animate-pulse bg-red-500"
              }`}
            />
            {(camera.cutting || camera.paused) && (
              <span className="text-xs text-white/70">
                {camera.paused ? "holding" : "cutting"}
              </span>
            )}
            <span className="font-mono text-sm text-white">
              {Math.floor(camera.elapsed / 60)}:
              {String(camera.elapsed % 60).padStart(2, "0")}
            </span>
          </div>
        )}

        {/* Prompter text -- NO smooth-scroll behavior on this container.
            Smooth-scroll behavior turns every frame's scrollTop assignment
            into its own competing CSS animation, fighting the rAF loop. */}
        {mode === "lines" ? (
          /* A couple of lines, held still, with the next one dimmed
             underneath so there is no surprise about what is coming.
             The whole area is the button: mid-take, a thumb anywhere on
             the screen should move it on, not a target you have to find. */
          <button
            type="button"
            onClick={() => setChunk((c) => Math.min(c + 1, chunks.length - 1))}
            className="absolute inset-0 flex flex-col items-center justify-start px-6 pt-14 text-center sm:px-16"
          >
            <p
              className={`font-semibold ${cameraOn ? "text-white" : "text-text"}`}
              style={{
                fontSize: textSize * 1.3,
                lineHeight: 1.25,
                textShadow: cameraOn ? "0 2px 12px rgba(0,0,0,0.9)" : undefined,
              }}
            >
              {chunks[chunk] ?? ""}
            </p>
            {chunks[chunk + 1] && (
              <p
                className={`mt-8 ${cameraOn ? "text-white/40" : "text-faint"}`}
                style={{ fontSize: textSize * 0.7, lineHeight: 1.3 }}
              >
                {chunks[chunk + 1]}
              </p>
            )}
          </button>
        ) : (
          <div
            ref={containerRef}
            className="absolute inset-0 overflow-y-auto px-6 pb-16 pt-14 sm:px-16"
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
        )}

        {/* Where you are, bottom left, out of the way of the words. */}
        {mode === "lines" && chunks.length > 0 && (
          <div className="pointer-events-none absolute bottom-3 left-4 z-10 flex items-center gap-2">
            <span className="rounded-full bg-black/50 px-2 py-0.5 font-mono text-xs text-white/70">
              {chunk + 1} / {chunks.length}
            </span>
          </div>
        )}
        {mode === "lines" && chunk > 0 && (
          <button
            type="button"
            onClick={() => setChunk((c) => Math.max(0, c - 1))}
            className="absolute bottom-2 right-3 z-10 rounded-full bg-black/50 px-3 py-2 text-xs text-white/80"
          >
            Back a line
          </button>
        )}
      </div>

      {/* Controls.
          Built for a thumb first. Everything you reach for mid-take is on
          the front row at a size you can hit without looking: play, record,
          and done. The dials you set once and leave are folded away behind
          Settings, because a bar that wraps into four rows on a phone is
          how you end up tapping Mark filmed when you meant Record. */}
      <div className="shrink-0 border-t border-border bg-panel px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-3xl space-y-2">
          {/* The pieces, newest at the bottom, in the order they go out.
              A list rather than one slot because filming is three goes at
              the opening, one good middle, and a closing line after a cup
              of tea. A fluffed line should cost one piece, not the reel. */}
          {camera.takes.length > 0 && (
            <button
              type="button"
              onClick={() => setReviewing(true)}
              className="flex w-full items-center gap-2 rounded-lg border border-accent/40 bg-accent/5 p-2 text-left"
            >
              <Film size={15} className="shrink-0 text-accent" />
              <span className="text-xs text-accent">
                {camera.takes.length} piece{camera.takes.length === 1 ? "" : "s"} filmed
              </span>
              <span className="ml-auto text-xs font-medium text-accent">
                Review and save
              </span>
            </button>
          )}

          {/* Front row: the three things you touch while filming. */}
          <div className="flex items-center gap-2">
            {/* Play starts and stops the scroll. In a few lines mode
                there is nothing to start: the screen waits for a tap, so
                the button would sit there doing nothing. */}
            {mode !== "lines" && (
              <button
                type="button"
                onClick={() => setPlaying((p) => !p)}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-bg"
                aria-label={playing ? "Pause" : "Play"}
              >
                {playing ? <Pause size={20} /> : <Play size={20} />}
              </button>
            )}

            {/* Pause keeps the take open: stop talking, walk somewhere
                else, carry on, and it is still one video. Only while
                rolling, so it never sits there as a dead button. */}
            {cameraOn && camera.recording && (
              <button
                type="button"
                onClick={() => {
                  if (camera.paused) {
                    camera.resumeRecording();
                    setPlaying(true);
                  } else {
                    camera.pauseRecording();
                    setPlaying(false);
                  }
                }}
                className={`flex h-12 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium ${
                  camera.paused
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border text-muted"
                }`}
              >
                {camera.paused ? <Play size={16} /> : <Pause size={16} />}
                {camera.paused ? "Continue" : "Hold"}
              </button>
            )}

            {cameraOn && (
              <button
                type="button"
                onClick={() => {
                  if (camera.recording) {
                    camera.stopRecording();
                    setPlaying(false);
                    // Straight into review, because the question after
                    // "stop" is always "was that any good".
                    setReviewing(true);
                  } else {
                    // Rewind to the top so the take starts at the hook, and
                    // start the scroll with it: pressing record and then
                    // having to press play is how you get three seconds of
                    // silence at the front of every clip.
                    scrollPosRef.current = 0;
                    if (containerRef.current) containerRef.current.scrollTop = 0;
                    lastTimeRef.current = null;
                    setChunk(0);
                    camera.startRecording();
                    setPlaying(true);
                  }
                }}
                className={`flex h-12 flex-1 items-center justify-center gap-2 rounded-full text-sm font-medium ${
                  camera.recording
                    ? "bg-red-500 text-white"
                    : "border border-red-500/60 text-red-400"
                }`}
              >
                {camera.recording ? <Square size={16} /> : <Circle size={16} />}
                {camera.recording ? "Stop and save" : "Record"}
              </button>
            )}

            <button
              type="button"
              onClick={markFilmed}
              disabled={isPending}
              className="flex h-12 shrink-0 items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-4 text-sm text-accent disabled:opacity-50"
            >
              <Check size={16} /> Done
            </button>
          </div>

          {/* Second row: moving between scripts, and the way in to the rest. */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goPrev}
              disabled={index === 0}
              className="flex h-11 w-11 items-center justify-center rounded-lg border border-border text-muted disabled:opacity-30"
              aria-label="Previous script"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={index >= remaining.length - 1}
              className="flex h-11 w-11 items-center justify-center rounded-lg border border-border text-muted disabled:opacity-30"
              aria-label="Next script"
            >
              <ChevronRight size={18} />
            </button>
            <span className="text-xs text-faint">
              {index + 1} / {remaining.length}
            </span>

            {camera.supported && (
              <button
                type="button"
                onClick={cameraOn ? camera.stopCamera : camera.startCamera}
                disabled={camera.state === "starting"}
                className="ml-auto flex h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-muted disabled:opacity-50"
              >
                {cameraOn ? <VideoOff size={16} /> : <Video size={16} />}
                {camera.state === "starting" ? "Starting" : cameraOn ? "Off" : "Camera"}
              </button>
            )}
            {canFullscreen && (
              <button
                type="button"
                onClick={toggleFullscreen}
                className="flex h-11 w-11 items-center justify-center rounded-lg border border-border text-muted"
                aria-label={isFullscreen ? "Exit full screen" : "Full screen"}
              >
                {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowSettings((v) => !v)}
              className={`flex h-11 w-11 items-center justify-center rounded-lg border ${
                showSettings ? "border-accent text-accent" : "border-border text-muted"
              }`}
              aria-label="Settings"
            >
              <SlidersHorizontal size={16} />
            </button>
          </div>

          {showSettings && (
            <div className="space-y-3 rounded-lg border border-border bg-panel-2 p-3">
              <div className="flex items-center gap-2">
                <span className="w-28 shrink-0 text-xs text-muted">Script shows as</span>
                <div className="flex flex-1 gap-1">
                  {(["scroll", "lines"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setMode(m);
                        setPlaying(false);
                      }}
                      className={`h-9 flex-1 rounded-lg border text-xs ${
                        mode === m
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-border text-muted"
                      }`}
                    >
                      {m === "scroll" ? "Scrolling" : "A few lines"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Speed belongs to scrolling. A few lines waits for a tap,
                  so there is no pace to set, and a dial that changes
                  nothing is the same fault as the full screen button. */}
              {mode !== "lines" && (
                <Dial label="Speed" value={speed} min={5} max={150} onChange={setSpeed} />
              )}
              <Dial label="Text size" value={textSize} min={18} max={56} onChange={setTextSize} />
              {cameraOn && (
                <Dial
                  label="Dim the video"
                  value={scrim}
                  min={0}
                  max={0.9}
                  step={0.05}
                  onChange={setScrim}
                />
              )}

              {cameraOn && (
                <div className="space-y-2 border-t border-border pt-3">
                  <label className="flex items-center gap-2 text-sm text-text">
                    <input
                      type="checkbox"
                      checked={camera.autoCut}
                      onChange={(e) => camera.setAutoCut(e.target.checked)}
                      disabled={camera.recording}
                      className="h-4 w-4 accent-current"
                    />
                    Cut out the quiet bits
                  </label>
                  <p className="text-[11px] text-faint">
                    The recorder stops while you are quiet and starts again when
                    you speak, so walking to the next spot is not in the video.
                    The uncut take is kept as well, in case the setting is wrong
                    for the room.
                  </p>
                  {camera.autoCut && (
                    <>
                      {/* A meter, because a number for "quiet" means nothing
                          until you can see your own room against it. Speak,
                          watch the bar, and put the line under your voice and
                          over the silence. */}
                      <div className="relative h-3 overflow-hidden rounded-full bg-panel">
                        <div
                          className={`h-full transition-[width] duration-75 ${
                            camera.level >= camera.threshold ? "bg-accent" : "bg-border"
                          }`}
                          style={{ width: `${Math.min(100, camera.level * 600)}%` }}
                        />
                        <div
                          className="absolute top-0 h-full w-0.5 bg-warn"
                          style={{ left: `${Math.min(100, camera.threshold * 600)}%` }}
                        />
                      </div>
                      <Dial
                        label="Quiet is below"
                        value={camera.threshold}
                        min={0.002}
                        max={0.08}
                        step={0.002}
                        onChange={camera.setThreshold}
                        disabled={camera.recording}
                      />
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * One labelled slider, with its value shown.
 *
 * The bare sliders gave no reading, so setting a speed meant nudging and
 * guessing rather than going back to the number that worked last time.
 */
function Dial({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center gap-3 text-xs text-muted">
      <span className="w-28 shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-6 flex-1 accent-[var(--accent)] disabled:opacity-40"
      />
      <span className="w-10 shrink-0 text-right font-mono text-faint">
        {step < 1 ? value.toFixed(step < 0.01 ? 3 : 2) : value}
      </span>
    </label>
  );
}

/** One filmed script, with the way back. */
function PutBack({ script }: { script: FilmedScript }) {
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-panel-2 p-2">
      <span className="min-w-0 flex-1 truncate text-xs text-text">{script.hook}</span>
      {done ? (
        <span className="text-[11px] text-accent">Back in the queue</span>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            await unfilmScriptAction(script.id);
            setDone(true);
          }}
          className="h-9 shrink-0 rounded-lg border border-accent/40 px-3 text-xs text-accent disabled:opacity-50"
        >
          Put it back
        </button>
      )}
    </div>
  );
}
