"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Scissors, X, Play, Pause, Undo2, Loader2, Trash2 } from "lucide-react";
import { keepRanges, keptSeconds, type Span } from "@/lib/session/recut";
import { canExport, exportCut } from "@/lib/session/export-video";
import { useTakeAudio, SLICES_PER_SECOND } from "./useTakeAudio";
import Waveform from "./Waveform";
import type { Take } from "./useRecorder";

/**
 * The editing room.
 *
 * Aaron, after filming for the first time: "i want the video to be put on
 * the site then i can make edits to it as i want. like how amplifi does it
 * showing the video and the sound waves cutting out the quiet spots".
 *
 * So: the video, the sound waves under it, the quiet parts found and shown
 * struck out, and each one his to keep or cut. Trimming the ends is done
 * by moving to a spot and saying "start here", because dragging a handle
 * to a tenth of a second is miserable on a phone and he films on a phone.
 *
 * Making the file takes as long as the video runs. That is the cost of
 * cutting without a video encoder in the page, it was his choice knowing
 * that, and the button says so rather than appearing to hang.
 */
export default function EditRoom({
  take,
  onDone,
  onClose,
}: {
  take: Take;
  /** Hands back the edited file to be kept alongside the original. */
  onDone: (file: File, seconds: number) => void;
  onClose: () => void;
}) {
  const audio = useTakeAudio(take.file);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  /** Gaps he has chosen to keep, by their start time. */
  const [kept, setKept] = useState<Set<number>>(new Set());

  /**
   * Cuts he marked himself, which is the other half of editing.
   *
   * Aaron: "I should be able to touch it and scroll where i want he cut
   * to happen then hit cut then i can scroll to the next section cut then
   * remove it". Finding the silences automatically only removes dead air.
   * Taking out a sentence he fluffed, or a whole run that went nowhere,
   * is his judgement and nothing can guess it.
   *
   * Two taps: mark where it starts, scrub, mark where it ends.
   */
  const [mine, setMine] = useState<Span[]>([]);
  const [markFrom, setMarkFrom] = useState<number | null>(null);

  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [ability, setAbility] = useState<{ ok: boolean; reason: string | null } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Measured from the decoded sound where possible: the figure recorded
  // while filming is a stopwatch reading and can be out by a little.
  const duration = audio.seconds || take.seconds;

  // Asked once, with the real pieces, so the button never promises
  // something this browser will refuse when it matters.
  useEffect(() => {
    let alive = true;
    canExport().then((r) => alive && setAbility(r));
    return () => {
      alive = false;
    };
  }, []);

  const cuts = useMemo(
    () => [...audio.quiet.filter((s) => !kept.has(s.start)), ...mine],
    [audio.quiet, kept, mine],
  );
  const ranges = useMemo(
    () => keepRanges(duration, cuts, trimStart, trimEnd),
    [duration, cuts, trimStart, trimEnd],
  );
  const after = keptSeconds(ranges);
  const saving = Math.max(0, duration - after);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const tick = () => setPlayhead(v.currentTime);
    v.addEventListener("timeupdate", tick);
    return () => v.removeEventListener("timeupdate", tick);
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const seek = (seconds: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(duration, seconds));
    setPlayhead(v.currentTime);
  };

  const toggleGap = (start: number) => {
    setKept((prev) => {
      const next = new Set(prev);
      if (next.has(start)) next.delete(start);
      else next.add(start);
      return next;
    });
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
      videoRef.current?.pause();
      setPlaying(false);
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

  const untouched = cuts.length === 0 && trimStart === 0 && trimEnd === 0;

  /** Finish the cut he is marking, whichever way round he marked it. */
  const closeMark = () => {
    if (markFrom === null) return;
    const start = Math.min(markFrom, playhead);
    const end = Math.max(markFrom, playhead);
    setMarkFrom(null);
    // Below about a frame there is nothing to remove, and a zero-length
    // cut would sit in the list looking like it had done something.
    if (end - start < 0.05) return;
    setMine((prev) => [...prev, { start, end }].sort((a, b) => a.start - b.start));
  };

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-bg">
      <div className="flex items-center gap-2 border-b border-border px-3 py-3">
        <Scissors size={16} className="text-accent" />
        <span className="text-sm font-medium text-text">Edit this piece</span>
        <button
          type="button"
          onClick={onClose}
          disabled={working}
          className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg text-muted disabled:opacity-40"
          aria-label="Close editing"
        >
          <X size={18} />
        </button>
      </div>

      {/* Scrolls. The summary and the button that does the work do not,
          because the same screen one step out had its buttons under the
          fold on a phone and that is the whole reason this session
          started. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl space-y-3 p-3">
        <video
          ref={videoRef}
          src={take.url}
          playsInline
          controls={false}
          onEnded={() => setPlaying(false)}
          className="mx-auto max-h-[32vh] rounded-lg bg-black"
        />

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const v = videoRef.current;
              if (!v) return;
              if (v.paused) {
                void v.play();
                setPlaying(true);
              } else {
                v.pause();
                setPlaying(false);
              }
            }}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-bg"
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <span className="font-mono text-xs tabular-nums text-muted">
            {playhead.toFixed(1)}s
          </span>
          <span className="ml-auto text-xs text-faint">
            {duration.toFixed(1)}s filmed
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
          cuts={cuts}
          trimStart={trimStart}
          trimEnd={trimEnd}
          playhead={playhead}
          markFrom={markFrom}
          onSeek={seek}
        />

        {/* Trimming the ends. Buttons rather than drag handles: this is
            used standing in front of a camera holding a phone. */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setTrimStart(playhead)}
            className="h-10 rounded-lg border border-border px-3 text-xs text-muted"
          >
            Start here
          </button>
          <button
            type="button"
            onClick={() => setTrimEnd(Math.max(0, duration - playhead))}
            className="h-10 rounded-lg border border-border px-3 text-xs text-muted"
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
              className="flex h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-muted"
            >
              <Undo2 size={13} /> Whole piece again
            </button>
          )}
        </div>

        {/* Marking a cut by hand. Sits right under the waveform because
            that is where the scrubbing happens. */}
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
                from {markFrom.toFixed(1)}s
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
        </div>
        {markFrom !== null && (
          <p className="text-xs text-faint">
            Now drag along the sound waves to where the cut should end, then
            press Cut to here.
          </p>
        )}

        {mine.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs text-faint">Cuts you marked</p>
            {mine.map((cut) => (
              <div
                key={`${cut.start}-${cut.end}`}
                className="flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/5 p-2.5 text-xs text-accent"
              >
                <span className="font-mono tabular-nums">
                  {cut.start.toFixed(1)}s to {cut.end.toFixed(1)}s
                </span>
                <span className="text-faint">{(cut.end - cut.start).toFixed(1)}s</span>
                <button
                  type="button"
                  onClick={() => setMine((p) => p.filter((c) => c !== cut))}
                  className="ml-auto flex h-8 items-center gap-1 rounded-lg border border-border px-2 text-muted"
                >
                  <Trash2 size={13} /> Put back
                </button>
              </div>
            ))}
          </div>
        )}

        {/* The gaps. Cut by default, because that is what he is here for,
            and one tap puts any of them back. */}
        {audio.quiet.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs text-faint">
              {audio.quiet.length} quiet {audio.quiet.length === 1 ? "spot" : "spots"} found.
              Tap one to keep it.
            </p>
            {audio.quiet.map((gap) => {
              const keeping = kept.has(gap.start);
              return (
                <button
                  key={gap.start}
                  type="button"
                  onClick={() => toggleGap(gap.start)}
                  className={`flex w-full items-center gap-2 rounded-lg border p-2.5 text-left text-xs ${
                    keeping
                      ? "border-border text-muted"
                      : "border-warn/40 bg-warn/5 text-warn"
                  }`}
                >
                  <span className="font-mono tabular-nums">
                    {gap.start.toFixed(1)}s to {gap.end.toFixed(1)}s
                  </span>
                  <span className="text-faint">
                    {(gap.end - gap.start).toFixed(1)}s
                  </span>
                  <span className="ml-auto font-medium">
                    {keeping ? "keeping" : "cutting"}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {!audio.loading && !audio.error && audio.quiet.length === 0 && (
          <p className="text-xs text-faint">
            No quiet spots long enough to be worth cutting. You can still
            trim the ends.
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
                about {Math.ceil(after)} seconds. Leave this screen open.
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
            The edited video is kept as a new piece. The one you filmed
            stays exactly as it is.
          </p>
        </div>
      </div>
    </div>
  );
}

function stem(name: string): string {
  return name.replace(/\.[^.]+$/, "") || "take";
}
