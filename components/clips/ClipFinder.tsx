"use client";

import { useEffect, useRef, useState } from "react";
import {
  Upload, Loader2, Scissors, Play, Download, AlertCircle, Check,
} from "lucide-react";
import type { Clip, TimedSegment } from "@/lib/clips/find";

/**
 * Finding the clips in a long take.
 *
 * He films one long piece to camera and then has to watch it back
 * deciding what to cut out of it, which is the part that does not
 * happen. This listens to it and says where the standalone moments are,
 * and then cuts each one with the same cutter the edit room uses.
 *
 * The transcript stays on the page under the clips on purpose. A
 * suggestion he disagrees with is almost impossible to judge against the
 * video, because judging it means watching the video again, and easy to
 * judge against the words.
 */

type Stage = "idle" | "reading" | "listening" | "ready";

interface CutState {
  index: number;
  done: number;
  url?: string;
}

export default function ClipFinder() {
  const [stage, setStage] = useState<Stage>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [segments, setSegments] = useState<TimedSegment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cutting, setCutting] = useState<CutState | null>(null);
  const [saved, setSaved] = useState<Record<number, string>>({});
  const [showWords, setShowWords] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stopAt = useRef<number | null>(null);

  // Object URLs outlive the component unless they are released, and a
  // page he uses on a few takes in a row would hold every video in
  // memory until the tab is closed.
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  async function load(chosen: File) {
    setError(null);
    setClips([]);
    setSegments([]);
    setSaved({});
    setFile(chosen);
    if (url) URL.revokeObjectURL(url);
    setUrl(URL.createObjectURL(chosen));

    setStage("reading");
    let audio: Blob;
    try {
      const { extractAudio } = await import("@/lib/clips/audio");
      ({ audio } = await extractAudio(chosen));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that file.");
      setStage("idle");
      return;
    }

    setStage("listening");
    try {
      const body = new FormData();
      body.append("audio", audio, "take.wav");
      const res = await fetch("/api/clips", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Could not listen to that.");
      setClips(Array.isArray(data.clips) ? data.clips : []);
      setSegments(Array.isArray(data.segments) ? data.segments : []);
      setStage("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not listen to that.");
      setStage("idle");
    }
  }

  function preview(clip: Clip) {
    const v = videoRef.current;
    if (!v) return;
    stopAt.current = clip.end;
    v.currentTime = clip.start;
    v.play().catch(() => {});
  }

  async function cut(clip: Clip, index: number) {
    if (!file) return;
    setError(null);
    setCutting({ index, done: 0 });
    try {
      const { chooseRoute, cutPieces } = await import("@/lib/session/export");
      const route = await chooseRoute();
      const result = await cutPieces(
        [{ source: file, ranges: [{ start: clip.start, end: clip.end }] }],
        route.route,
        { onProgress: (p) => setCutting({ index, done: p.done }) },
      );
      setSaved((s) => ({ ...s, [index]: URL.createObjectURL(result.blob) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not cut that clip.");
    } finally {
      setCutting(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-text">Clip finder</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Load a long take. This listens to it and says which parts stand on
          their own, then cuts the ones you want.
        </p>
      </div>

      <label className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-accent text-sm font-medium text-bg">
        <Upload size={16} />
        {file ? "Load a different one" : "Load a video"}
        <input
          type="file"
          accept="video/*,audio/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) load(f);
            e.target.value = "";
          }}
        />
      </label>

      {(stage === "reading" || stage === "listening") && (
        <p className="flex items-center gap-2 rounded-lg border border-border bg-panel px-3 py-3 text-sm text-muted">
          <Loader2 size={15} className="animate-spin" />
          {stage === "reading" ? "Getting the sound out..." : "Listening to it..."}
        </p>
      )}

      {error && (
        <p className="flex items-start gap-1.5 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}

      {url && (
        <video
          ref={videoRef}
          src={url}
          controls
          playsInline
          onTimeUpdate={(e) => {
            // Stops at the end of whichever clip he previewed, so the
            // preview is the clip rather than the rest of the take.
            const v = e.currentTarget;
            if (stopAt.current !== null && v.currentTime >= stopAt.current) {
              v.pause();
              stopAt.current = null;
            }
          }}
          className="w-full rounded-xl border border-border bg-black"
        />
      )}

      {stage === "ready" && clips.length === 0 && (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-faint">
          Nothing in this one stands on its own. That is usually a take that
          builds to one point rather than holding several.
        </p>
      )}

      {clips.length > 0 && (
        <ul className="space-y-2">
          {clips.map((c, i) => (
            <li key={`${c.start}-${c.end}`} className="space-y-2 rounded-xl border border-border bg-panel p-3">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-medium text-text">
                  {formatTime(c.start)} to {formatTime(c.end)}
                </span>
                <span className="text-xs text-faint">
                  {Math.round(c.end - c.start)} seconds
                </span>
              </div>
              {c.opening && (
                <p className="text-sm text-muted">&ldquo;{c.opening}&rdquo;</p>
              )}
              {c.why && <p className="text-xs text-faint">{c.why}</p>}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => preview(c)}
                  className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-muted"
                >
                  <Play size={15} /> Play it
                </button>
                {saved[i] ? (
                  <a
                    href={saved[i]}
                    download={`clip-${Math.round(c.start)}s.mp4`}
                    className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-medium text-bg"
                  >
                    <Download size={15} /> Save it
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => cut(c, i)}
                    disabled={cutting !== null}
                    className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-accent px-3 text-sm font-medium text-accent disabled:opacity-40"
                  >
                    {cutting?.index === i ? (
                      <>
                        <Loader2 size={15} className="animate-spin" />
                        {Math.round((cutting.done ?? 0) * 100)}%
                      </>
                    ) : (
                      <>
                        <Scissors size={15} /> Cut this one
                      </>
                    )}
                  </button>
                )}
                {saved[i] && <Check size={16} className="self-center text-accent" />}
              </div>
            </li>
          ))}
        </ul>
      )}

      {segments.length > 0 && (
        <div className="rounded-xl border border-border bg-panel p-3">
          <button
            type="button"
            onClick={() => setShowWords((v) => !v)}
            className="flex h-9 items-center text-xs text-muted"
          >
            {showWords ? "Hide what it heard" : "Show what it heard"}
          </button>
          {showWords && (
            <ul className="mt-2 space-y-1">
              {segments.map((s) => (
                <li key={s.start} className="text-xs text-faint">
                  <button
                    type="button"
                    onClick={() => {
                      const v = videoRef.current;
                      if (!v) return;
                      stopAt.current = null;
                      v.currentTime = s.start;
                      v.play().catch(() => {});
                    }}
                    className="tabular-nums text-muted"
                  >
                    {formatTime(s.start)}
                  </button>{" "}
                  {s.text}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
