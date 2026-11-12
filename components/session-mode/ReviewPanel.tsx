"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Play, Smartphone, Download, X, Scissors, Combine } from "lucide-react";
import EditRoom from "./EditRoom";
import { chooseRoute, cutPieces, type RouteChoice } from "@/lib/session/export";
import type { Take } from "./useRecorder";

/**
 * The step between filming and saving.
 *
 * Deleting a piece from a row in the control bar is technically editing
 * and does not feel like it. Aaron filmed, looked for somewhere to edit,
 * and did not find one, which means the place to do it has to be a
 * place, not a row of small buttons under the camera.
 *
 * So this is a screen: watch the whole thing back in order, throw away
 * the bad pieces, move the rest around, then save. The same actions,
 * somewhere you would think to look for them.
 *
 * Cutting inside a piece lives one step further in, in the editing room,
 * which is where the sound waves and the quiet spots are. It is a
 * separate screen because it is a different job: this one is about which
 * pieces and in what order, that one is about what happens inside one.
 */
export default function ReviewPanel({
  takes,
  canShare,
  saveNote,
  onSave,
  onSaveUncut,
  onRemove,
  onMove,
  onEdited,
  onClose,
}: {
  takes: Take[];
  canShare: boolean;
  saveNote: string | null;
  onSave: (id: number) => Promise<void>;
  onSaveUncut: (id: number) => Promise<void>;
  onRemove: (id: number) => void;
  onMove: (id: number, direction: -1 | 1) => void;
  /** An edited copy, kept as a new piece beside the one it came from. */
  onEdited: (file: File, seconds: number, note?: string) => void;
  onClose: () => void;
}) {
  const [active, setActive] = useState(0);
  const [playingAll, setPlayingAll] = useState(false);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinProgress, setJoinProgress] = useState(0);
  const [joinProblem, setJoinProblem] = useState<string | null>(null);
  const [plan, setPlan] = useState<RouteChoice | null>(null);
  const joinAbort = useRef<AbortController | null>(null);

  // Asked with the real pieces rather than guessed, so the button is not
  // offered to a browser that will refuse it.
  useEffect(() => {
    let alive = true;
    chooseRoute().then((r) => alive && setPlan(r));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => () => joinAbort.current?.abort(), []);

  /**
   * Put every piece together, in the order shown, into one video.
   *
   * This is the step that was missing. He films in pieces on purpose, a
   * fluffed line costing one piece rather than the whole reel, and then
   * had three separate files and no way to join them without leaving the
   * app. Same machinery as cutting: play them in order into one recorder.
   */
  const joinAll = async () => {
    setJoinProblem(null);
    const controller = new AbortController();
    joinAbort.current = controller;
    setJoining(true);
    setJoinProgress(0);
    try {
      const result = await cutPieces(
        takes.map((t) => ({ source: t.file, ranges: [{ start: 0, end: t.seconds }] })),
        plan?.route ?? "playback",
        { signal: controller.signal, onProgress: (p) => setJoinProgress(p.done) },
      );
      const extension = result.type.includes("mp4") ? "mp4" : "webm";
      onEdited(
        new File([result.blob], `session-joined.${extension}`, { type: result.type }),
        result.seconds,
        `joined from ${takes.length}`,
      );
    } catch (err) {
      setJoinProblem(
        err instanceof Error && err.message === "Stopped."
          ? "Stopped. Nothing was changed."
          : `Could not join them: ${
              err instanceof Error ? err.message : "the browser gave no reason."
            } Your pieces are all still here.`,
      );
    } finally {
      setJoining(false);
      joinAbort.current = null;
    }
  };
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const total = takes.reduce((n, t) => n + t.seconds, 0);
  const current = takes[Math.min(active, takes.length - 1)];

  // Playing the pieces end to end, which is the only way to tell whether
  // the order is right. Stepping to the next one on ended rather than
  // stitching anything: no encoder needed to watch it in order.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onEnded = () => {
      if (!playingAll) return;
      if (active < takes.length - 1) setActive((i) => i + 1);
      else setPlayingAll(false);
    };
    v.addEventListener("ended", onEnded);
    return () => v.removeEventListener("ended", onEnded);
  }, [playingAll, active, takes.length]);

  useEffect(() => {
    const v = videoRef.current;
    if (v && playingAll) v.play().catch(() => setPlayingAll(false));
  }, [active, playingAll]);

  if (takes.length === 0) return null;

  const beingEdited = takes.find((t) => t.id === editing);

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-bg">
      {beingEdited && (
        <EditRoom
          take={beingEdited}
          onDone={(file, seconds) => {
            onEdited(file, seconds, "cut down");
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <p className="text-sm font-semibold text-text">
          Review
          <span className="ml-2 text-xs font-normal text-faint">
            {takes.length} piece{takes.length === 1 ? "" : "s"}, {clock(total)}
          </span>
        </p>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto flex h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-muted"
        >
          <X size={15} /> Back to filming
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="mx-auto max-w-2xl space-y-3">
          {current && (
            <div className="space-y-2">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video
                ref={videoRef}
                key={current.id}
                src={current.url}
                controls
                playsInline
                className="max-h-[45vh] w-full rounded-lg bg-black"
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setActive(0);
                    setPlayingAll(true);
                  }}
                  className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-accent px-3 text-sm font-medium text-accent"
                >
                  <Play size={15} />
                  {playingAll ? "Playing all" : "Play all in order"}
                </button>
                {takes.length > 1 && plan?.route !== "none" && !joining && (
                  <button
                    type="button"
                    onClick={joinAll}
                    className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-muted"
                  >
                    <Combine size={15} />
                    Join into one video
                  </button>
                )}
                <span className="text-xs text-faint">
                  Piece {Math.min(active, takes.length - 1) + 1} of {takes.length}
                </span>
              </div>
            </div>
          )}

          {joining && (
            <div className="space-y-2 rounded-lg border border-border bg-panel p-3">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel-2">
                <div
                  className="h-full bg-accent transition-[width] duration-200"
                  style={{ width: `${Math.round(joinProgress * 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted">
                Joining your {takes.length} pieces, {plan?.estimate(total) ?? "shortly"}.
                {plan?.route === "playback" &&
                  " It plays them through to record them, so keep this page on screen and do not let the phone lock, or the picture stops and the sound carries on without it."}
              </p>
              <button
                type="button"
                onClick={() => joinAbort.current?.abort()}
                className="h-9 rounded-lg border border-border px-3 text-xs text-muted"
              >
                Stop
              </button>
            </div>
          )}
          {joinProblem && (
            <p className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
              {joinProblem}
            </p>
          )}

          <ul className="space-y-1">
            {takes.map((t, i) => (
              <li
                key={t.id}
                className={`rounded-lg border p-2 ${
                  i === active ? "border-accent bg-accent/5" : "border-border bg-panel"
                }`}
              >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPlayingAll(false);
                      setActive(i);
                    }}
                    className="min-w-0 flex-1 text-left text-xs text-text"
                  >
                    <span className="mr-2 text-faint">{i + 1}</span>
                    {clock(t.seconds)}
                    <span className="ml-2 text-faint">
                      {t.mb} MB, {t.format.toUpperCase()}
                      {t.uncut ? ", cut" : ""}
                    </span>
                    {t.note && (
                      <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] text-accent">
                        {t.note}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onMove(t.id, -1)}
                    disabled={i === 0}
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-border text-muted disabled:opacity-25"
                    aria-label="Move earlier"
                  >
                    <ArrowUp size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onMove(t.id, 1)}
                    disabled={i === takes.length - 1}
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-border text-muted disabled:opacity-25"
                    aria-label="Move later"
                  >
                    <ArrowDown size={15} />
                  </button>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onSave(t.id)}
                    className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-accent px-3 text-xs font-medium text-accent"
                  >
                    {canShare ? <Smartphone size={14} /> : <Download size={14} />}
                    Save this one
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(t.id)}
                    className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-muted"
                  >
                    <Scissors size={14} /> Edit
                  </button>
                  {t.uncut && (
                    <button
                      type="button"
                      onClick={() => onSaveUncut(t.id)}
                      className="inline-flex h-10 items-center rounded-lg border border-border px-3 text-xs text-muted"
                    >
                      Save uncut
                    </button>
                  )}
                  {confirming === t.id ? (
                    <span className="ml-auto flex items-center gap-2 text-[11px]">
                      <span className="text-warn">Gone for good.</span>
                      <button
                        type="button"
                        onClick={() => {
                          onRemove(t.id);
                          setConfirming(null);
                          setActive(0);
                        }}
                        className="rounded-full border border-warn px-2 py-1 text-warn"
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(null)}
                        className="rounded-full border border-border px-2 py-1 text-muted"
                      >
                        Keep
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirming(t.id)}
                      className="ml-auto text-xs text-faint underline underline-offset-2 hover:text-warn"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {takes.some((t) => t.format !== "mp4") && (
            <p className="text-[11px] text-warn">
              This browser records in{" "}
              {takes.find((t) => t.format !== "mp4")?.format.toUpperCase()}, not
              MP4. Instagram takes MP4. If a piece will not upload, that is why,
              and recording in Chrome or Safari usually gives MP4 instead.
            </p>
          )}

          {saveNote && <p className="text-[11px] text-accent">{saveNote}</p>}

          <p className="text-[11px] text-faint">
            Save every piece you want to keep. They live in this page only, so
            leaving or reloading loses anything unsaved. Trimming inside a piece
            is not here yet: cut what you can with Hold while filming, and bin
            whole pieces here.
          </p>
        </div>
      </div>
    </div>
  );
}

function clock(seconds: number): string {
  // Rounded first. An edited piece's length is measured from its audio and
  // comes back as a fraction, which rendered as "0:7.559977324263041"
  // sitting in the middle of the review list.
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
