"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Scissors, ArrowLeft, Play, Pause, Undo2, Loader2, Trash2,
  ZoomIn, ZoomOut, ChevronLeft, ChevronRight, RotateCcw,
} from "lucide-react";
import { keepRanges, keptSeconds, type Span } from "@/lib/session/recut";
import { canExport, exportCut } from "@/lib/session/export-video";
import { useTakeAudio, SLICES_PER_SECOND } from "./useTakeAudio";
import Waveform from "./Waveform";
import type { Take } from "./useRecorder";

/** How far one press of a nudge button moves an edge. */
const NUDGE = 0.1;
/** Zoom steps. 1 is the whole piece, 16 is a sixteenth of it. */
const ZOOMS = [1, 2, 4, 8, 16];

/**
 * One stretch being taken out of the piece.
 *
 * Found gaps and ones he marked himself are the same kind of thing here,
 * which they were not before. They were two separate pieces of state, a
 * set of found gaps he had switched off and a list of his own, and that
 * split made "move this edge a little" impossible to offer for the found
 * ones. Aaron: "i do like the auto cuts ... but i do want to be able to
 * play it with the cuts out as they are to hear it or manually move it as
 * needed". One list, every cut adjustable.
 */
interface Cut {
  id: string;
  start: number;
  end: number;
  /** True when he drew it, false when it was found for him. */
  mine: boolean;
  /** Switched off: shown, but not taken out. */
  off: boolean;
}

/**
 * The editing room.
 *
 * The video, the sound waves under it, every cut in red so there is no
 * guessing what goes, and a way to hear the edit before committing to
 * making the file.
 */
export default function EditRoom({
  take,
  onDone,
  onClose,
}: {
  take: Take;
  onDone: (file: File, seconds: number) => void;
  onClose: () => void;
}) {
  const audio = useTakeAudio(take.file);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [zoom, setZoom] = useState(1);

  const [cuts, setCuts] = useState<Cut[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [markFrom, setMarkFrom] = useState<number | null>(null);

  /**
   * Play it as it will be, skipping the cuts.
   *
   * The whole point of hearing it before making the file: making the file
   * takes as long as the video runs, so finding out there that a cut
   * lands badly costs a minute each time.
   */
  const [preview, setPreview] = useState(false);
  const previewRef = useRef(false);

  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [ability, setAbility] = useState<{ ok: boolean; reason: string | null } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const duration = audio.seconds || take.seconds;

  useEffect(() => {
    let alive = true;
    canExport().then((r) => alive && setAbility(r));
    return () => {
      alive = false;
    };
  }, []);

  // Take the found gaps into the list, once, when the sound has been read.
  //
  // Waits for the sound to actually arrive, not merely for loading to be
  // false. The hook reports loading false for the first render, before
  // its own effect has started, so gating on that alone seeded the list
  // as empty and then never looked again: every found gap was lost and
  // the summary said a ten second piece becomes ten seconds.
  useEffect(() => {
    if (cuts !== null || audio.loading) return;
    if (audio.loudness.length === 0 && !audio.error) return;
    setCuts(
      audio.quiet.map((gap, i) => ({
        id: `found-${i}`,
        start: gap.start,
        end: gap.end,
        mine: false,
        off: false,
      })),
    );
  }, [audio.loading, audio.loudness, audio.error, audio.quiet, cuts]);

  const list = useMemo(() => cuts ?? [], [cuts]);
  const active = useMemo(() => list.filter((c) => !c.off), [list]);
  const ranges = useMemo(
    () => keepRanges(duration, active, trimStart, trimEnd),
    [duration, active, trimStart, trimEnd],
  );
  const after = keptSeconds(ranges);
  const saving = Math.max(0, duration - after);

  const activeRef = useRef<Cut[]>([]);
  activeRef.current = active;
  const rangesRef = useRef<Span[]>([]);
  rangesRef.current = ranges;

  /*
   * Follow playback, and while previewing, jump over anything being cut.
   *
   * Checked every frame rather than on the video's own timeupdate event,
   * which fires about four times a second. At that rate a quarter of a
   * second of the cut plays before the jump, which is plenty to hear, and
   * the whole point of previewing is to hear what the edit sounds like
   * rather than what it does not.
   */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const at = v.currentTime;
      if (previewRef.current && !v.paused) {
        const inside = activeRef.current.find((c) => at >= c.start && at < c.end - 0.02);
        if (inside) {
          const next = rangesRef.current.find((r) => r.start >= inside.end - 0.01);
          if (next) v.currentTime = next.start;
          else {
            v.pause();
            setPlaying(false);
          }
          return;
        }
        const last = rangesRef.current[rangesRef.current.length - 1];
        if (last && at >= last.end - 0.02) {
          v.pause();
          setPlaying(false);
        }
      }
      setPlayhead(at);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const seek = (seconds: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(duration, seconds));
    setPlayhead(v.currentTime);
  };

  const nudgePlayhead = (by: number) => seek(playhead + by);

  const startPlaying = (asEdited: boolean) => {
    const v = videoRef.current;
    if (!v) return;
    previewRef.current = asEdited;
    setPreview(asEdited);
    if (asEdited) {
      // Begin at the first thing that survives, not at a cut. Sitting on
      // a cut is the normal case, because tapping a cut in the list moves
      // the playhead to its start.
      const kept = rangesRef.current;
      const insideKept = kept.some((r) => v.currentTime >= r.start && v.currentTime < r.end);
      if (!insideKept && kept[0]) {
        const next = kept.find((r) => r.start >= v.currentTime);
        v.currentTime = (next ?? kept[0]).start;
      }
    }
    void v.play();
    setPlaying(true);
  };

  const stopPlaying = () => {
    videoRef.current?.pause();
    setPlaying(false);
  };

  const closeMark = () => {
    if (markFrom === null) return;
    const start = Math.min(markFrom, playhead);
    const end = Math.max(markFrom, playhead);
    setMarkFrom(null);
    if (end - start < 0.05) return;
    const id = `mine-${Date.now()}`;
    setCuts((prev) => [...(prev ?? []), { id, start, end, mine: true, off: false }]);
    setSelected(id);
  };

  const move = (id: string, edge: "start" | "end", by: number) => {
    setCuts((prev) =>
      (prev ?? []).map((c) => {
        if (c.id !== id) return c;
        const next = { ...c, [edge]: c[edge] + by };
        // Never let an edge cross the other one, or the cut inverts and
        // quietly stops removing anything.
        if (next.end - next.start < 0.05) return c;
        return {
          ...next,
          start: Math.max(0, Math.min(next.start, duration)),
          end: Math.max(0, Math.min(next.end, duration)),
        };
      }),
    );
  };

  const makeTheCut = async () => {
    setProblem(null);
    if (ranges.length === 0) {
      setProblem("There is nothing left after those cuts. Keep at least one part.");
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setWorking(true);
    setProgress(0);
    try {
      stopPlaying();
      const result = await exportCut(take.file, ranges, {
        signal: controller.signal,
        onProgress: (p) => setProgress(p.done),
      });
      const extension = result.type.includes("mp4") ? "mp4" : "webm";
      const file = new File([result.blob], `${stem(take.file.name)}-edited.${extension}`, {
        type: result.type,
      });
      onDone(file, result.seconds);
    } catch (err) {
      setProblem(
        err instanceof Error && err.message === "Stopped."
          ? "Stopped. Nothing was changed."
          : `The edit did not finish: ${
              err instanceof Error ? err.message : "the browser gave no reason."
            } Your original piece is untouched.`,
      );
    } finally {
      setWorking(false);
      abortRef.current = null;
    }
  };

  const untouched = active.length === 0 && trimStart === 0 && trimEnd === 0;
  const chosen = list.find((c) => c.id === selected) ?? null;

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-bg">
      {/* A back button with a word on it. The X that used to be here was
          an icon alone in the corner, and he could not find it: "THE PUT
          IT BACK SCREEN IT DOESNT HAVE A BACK BUTTON AT ALL". */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-3">
        <button
          type="button"
          onClick={onClose}
          disabled={working}
          className="flex h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-muted disabled:opacity-40"
        >
          <ArrowLeft size={16} /> Back to pieces
        </button>
        <span className="ml-auto flex items-center gap-1.5 text-sm font-medium text-text">
          <Scissors size={15} className="text-accent" /> Edit
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl space-y-3 p-3">
          <video
            ref={videoRef}
            src={take.url}
            playsInline
            controls={false}
            onEnded={() => setPlaying(false)}
            className="mx-auto max-h-[30vh] rounded-lg bg-black"
          />

          {/* Playing it. Two buttons, because hearing it as filmed and
              hearing it as edited are different questions. */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => (playing && preview ? stopPlaying() : startPlaying(true))}
              className="flex h-11 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-medium text-bg"
            >
              {playing && preview ? <Pause size={16} /> : <Play size={16} />}
              Play with cuts
            </button>
            <button
              type="button"
              onClick={() => (playing && !preview ? stopPlaying() : startPlaying(false))}
              className="flex h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-muted"
            >
              {playing && !preview ? <Pause size={16} /> : <Play size={16} />}
              As filmed
            </button>
            <span className="ml-auto font-mono text-xs tabular-nums text-muted">
              {playhead.toFixed(2)}s
            </span>
          </div>

          {audio.loading && (
            <p className="flex items-center gap-2 text-xs text-muted">
              <Loader2 size={13} className="animate-spin" /> Reading the sound...
            </p>
          )}
          {audio.error && (
            <p className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
              {audio.error}
            </p>
          )}

          <Waveform
            loudness={audio.loudness}
            slicesPerSecond={SLICES_PER_SECOND}
            duration={duration}
            cuts={active}
            trimStart={trimStart}
            trimEnd={trimEnd}
            playhead={playhead}
            markFrom={markFrom}
            zoom={zoom}
            onSeek={seek}
          />
          <p className="text-[11px] text-faint">
            Red is what gets cut out.
            {zoom > 1 && " Zoomed in, so the strip follows the playhead."}
          </p>

          {/* Zoom and fine movement. Dragging a whole minute across a
              phone screen is about a fifth of a second per pixel, which is
              no use for placing a cut by hand. */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setZoom((z) => ZOOMS[Math.max(0, ZOOMS.indexOf(z) - 1)] ?? 1)}
              disabled={zoom === ZOOMS[0]}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-border text-muted disabled:opacity-30"
              aria-label="Zoom out"
            >
              <ZoomOut size={16} />
            </button>
            <span className="w-10 text-center font-mono text-xs text-muted">{zoom}x</span>
            <button
              type="button"
              onClick={() => setZoom((z) => ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(z) + 1)] ?? z)}
              disabled={zoom === ZOOMS[ZOOMS.length - 1]}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-border text-muted disabled:opacity-30"
              aria-label="Zoom in"
            >
              <ZoomIn size={16} />
            </button>
            <span className="mx-1 h-6 w-px bg-border" />
            <button
              type="button"
              onClick={() => nudgePlayhead(-NUDGE)}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-border text-muted"
              aria-label="Back a tenth of a second"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-[11px] text-faint">0.1s</span>
            <button
              type="button"
              onClick={() => nudgePlayhead(NUDGE)}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-border text-muted"
              aria-label="On a tenth of a second"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Marking a cut by hand. */}
          <div className="flex flex-wrap items-center gap-2">
            {markFrom === null ? (
              <button
                type="button"
                onClick={() => setMarkFrom(playhead)}
                className="flex h-11 items-center gap-1.5 rounded-lg border border-accent px-3 text-sm font-medium text-accent"
              >
                <Scissors size={15} /> Cut from here
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={closeMark}
                  className="flex h-11 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-medium text-bg"
                >
                  <Scissors size={15} /> Cut to here
                </button>
                <span className="font-mono text-xs text-accent">
                  from {markFrom.toFixed(2)}s
                </span>
                <button
                  type="button"
                  onClick={() => setMarkFrom(null)}
                  className="h-11 rounded-lg border border-border px-3 text-xs text-muted"
                >
                  Never mind
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setTrimStart(playhead)}
              className="h-11 rounded-lg border border-border px-3 text-xs text-muted"
            >
              Start here
            </button>
            <button
              type="button"
              onClick={() => setTrimEnd(Math.max(0, duration - playhead))}
              className="h-11 rounded-lg border border-border px-3 text-xs text-muted"
            >
              End here
            </button>
            {(trimStart > 0 || trimEnd > 0) && (
              <button
                type="button"
                onClick={() => {
                  setTrimStart(0);
                  setTrimEnd(0);
                }}
                className="flex h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-muted"
              >
                <Undo2 size={13} /> Whole piece
              </button>
            )}
          </div>
          {markFrom !== null && (
            <p className="text-xs text-faint">
              Drag along the sound waves to where it should end, then press
              Cut to here.
            </p>
          )}

          {/* Every cut, found or drawn, in one list. */}
          {list.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-faint">
                {active.length} of {list.length} being cut. Tap one to work on it.
              </p>
              {list.map((cut) => {
                const isChosen = cut.id === selected;
                return (
                  <div
                    key={cut.id}
                    className={`rounded-lg border p-2.5 ${
                      cut.off
                        ? "border-border bg-panel"
                        : "border-red-500/50 bg-red-500/10"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(isChosen ? null : cut.id);
                        seek(cut.start);
                      }}
                      className="flex w-full items-center gap-2 text-left text-xs"
                    >
                      <span
                        className={`font-mono tabular-nums ${
                          cut.off ? "text-muted" : "text-red-400"
                        }`}
                      >
                        {cut.start.toFixed(2)}s to {cut.end.toFixed(2)}s
                      </span>
                      <span className="text-faint">
                        {(cut.end - cut.start).toFixed(2)}s
                      </span>
                      <span className="ml-auto text-faint">
                        {cut.mine ? "yours" : "found"}
                      </span>
                      <span
                        className={`font-medium ${
                          cut.off ? "text-muted" : "text-red-400"
                        }`}
                      >
                        {cut.off ? "keeping" : "cutting"}
                      </span>
                    </button>

                    {isChosen && (
                      <div className="mt-2 space-y-2 border-t border-border pt-2">
                        <div className="flex items-center gap-1.5">
                          <span className="w-10 text-[11px] text-faint">start</span>
                          <button type="button" onClick={() => move(cut.id, "start", -NUDGE)}
                            className="h-9 w-9 rounded-lg border border-border text-muted" aria-label="Start earlier">
                            <ChevronLeft size={14} className="mx-auto" />
                          </button>
                          <button type="button" onClick={() => move(cut.id, "start", NUDGE)}
                            className="h-9 w-9 rounded-lg border border-border text-muted" aria-label="Start later">
                            <ChevronRight size={14} className="mx-auto" />
                          </button>
                          <span className="ml-3 w-10 text-[11px] text-faint">end</span>
                          <button type="button" onClick={() => move(cut.id, "end", -NUDGE)}
                            className="h-9 w-9 rounded-lg border border-border text-muted" aria-label="End earlier">
                            <ChevronLeft size={14} className="mx-auto" />
                          </button>
                          <button type="button" onClick={() => move(cut.id, "end", NUDGE)}
                            className="h-9 w-9 rounded-lg border border-border text-muted" aria-label="End later">
                            <ChevronRight size={14} className="mx-auto" />
                          </button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setCuts((p) =>
                                (p ?? []).map((c) => (c.id === cut.id ? { ...c, off: !c.off } : c)),
                              )
                            }
                            className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[11px] text-muted"
                          >
                            <RotateCcw size={12} />
                            {cut.off ? "Cut it after all" : "Put this back"}
                          </button>
                          {cut.mine && (
                            <button
                              type="button"
                              onClick={() => {
                                setCuts((p) => (p ?? []).filter((c) => c.id !== cut.id));
                                setSelected(null);
                              }}
                              className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[11px] text-muted"
                            >
                              <Trash2 size={12} /> Delete this cut
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {!audio.loading && !audio.error && list.length === 0 && (
            <p className="text-xs text-faint">
              No quiet spots long enough to be worth cutting. You can still
              mark cuts yourself and trim the ends.
            </p>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-border bg-panel px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto w-full max-w-2xl">
          <p className="text-sm text-text">
            {duration.toFixed(1)}s becomes{" "}
            <span className="font-medium text-accent">{after.toFixed(1)}s</span>
            {saving > 0.05 && (
              <span className="text-muted">, losing {saving.toFixed(1)}s</span>
            )}
          </p>
          {ability && !ability.ok && (
            <p className="mt-2 text-xs text-warn">{ability.reason}</p>
          )}
          {problem && <p className="mt-2 text-xs text-warn">{problem}</p>}

          {working ? (
            <div className="mt-3 space-y-2">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel-2">
                <div
                  className="h-full bg-accent transition-[width] duration-200"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted">
                Making the cut video. This runs in real time, so it takes
                about {Math.ceil(after)} seconds. Keep this page on screen
                and do not let the phone lock, or the picture stops and the
                sound carries on without it.
              </p>
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                className="h-9 rounded-lg border border-border px-3 text-xs text-muted"
              >
                Stop
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={makeTheCut}
              disabled={untouched || (ability ? !ability.ok : false) || ranges.length === 0}
              className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent text-sm font-medium text-bg disabled:opacity-40"
            >
              <Scissors size={15} />
              {untouched ? "Nothing to cut yet" : `Make the cut (about ${Math.ceil(after)}s)`}
            </button>
          )}
          <p className="mt-2 text-[11px] text-faint">
            Hear it with Play with cuts first. The edited video comes out
            tall, cropped to the middle the way the guide showed while you
            filmed, and is kept as a new piece; the one you filmed stays as
            it is.
          </p>
        </div>
      </div>
    </div>
  );
}

function stem(name: string): string {
  return name.replace(/\.[^.]+$/, "") || "take";
}
