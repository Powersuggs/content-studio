"use client";

import { useEffect, useRef } from "react";
import type { Span } from "@/lib/session/recut";

/**
 * The sound of a take, drawn.
 *
 * This is the part Aaron asked for by name: "showing the video and the
 * sound waves cutting out the quiet spots". Seeing where the gaps are is
 * most of the value, because it turns "somewhere in the middle I waffled"
 * into a thing you can point at.
 *
 * Drawn on a canvas rather than built from elements, because a minute of
 * video is three thousand readings and three thousand divs would make a
 * phone crawl.
 */
export default function Waveform({
  loudness,
  slicesPerSecond,
  duration,
  cuts,
  trimStart,
  trimEnd,
  playhead,
  markFrom,
  onSeek,
}: {
  loudness: number[];
  slicesPerSecond: number;
  duration: number;
  /** Stretches being removed, shown struck out. */
  cuts: Span[];
  trimStart: number;
  trimEnd: number;
  /** Where playback is, in seconds. */
  playhead: number;
  /** Where a cut he is marking by hand begins, if he is marking one. */
  markFrom?: number | null;
  onSeek: (seconds: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const paint = canvas.getContext("2d");
    if (!paint) return;

    // Draw at the screen's real pixel density, or it looks soft on a phone.
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    paint.setTransform(ratio, 0, 0, ratio, 0, 0);
    paint.clearRect(0, 0, width, height);

    if (!duration || loudness.length === 0) return;

    const xOf = (seconds: number) => (seconds / duration) * width;
    const middle = height / 2;
    let peak = 0;
    for (const v of loudness) if (v > peak) peak = v;
    const scale = peak > 0 ? (height / 2 - 2) / peak : 0;

    // Everything being removed, shaded first so the bars sit on top of it.
    const removed: Span[] = [
      ...(trimStart > 0 ? [{ start: 0, end: trimStart }] : []),
      ...cuts,
      ...(trimEnd > 0 ? [{ start: duration - trimEnd, end: duration }] : []),
    ];
    for (const span of removed) {
      paint.fillStyle = "rgba(230, 178, 61, 0.16)";
      paint.fillRect(xOf(span.start), 0, xOf(span.end) - xOf(span.start), height);
    }

    // One bar per pixel column, taking the loudest reading in that column
    // so a quiet gap cannot be hidden by averaging it with speech.
    const perColumn = loudness.length / width;
    for (let x = 0; x < width; x++) {
      const from = Math.floor(x * perColumn);
      const to = Math.max(from + 1, Math.floor((x + 1) * perColumn));
      let loudest = 0;
      for (let i = from; i < to && i < loudness.length; i++) {
        if (loudness[i] > loudest) loudest = loudness[i];
      }
      const seconds = (x / width) * duration;
      const isRemoved = removed.some((s) => seconds >= s.start && seconds < s.end);
      const bar = Math.max(1, loudest * scale);
      paint.fillStyle = isRemoved ? "rgba(154, 160, 168, 0.35)" : "#3ecf8e";
      paint.fillRect(x, middle - bar, 1, bar * 2);
    }

    // The start of a cut being marked, and the stretch it covers so far,
    // so he can see what he is about to remove before he commits to it.
    if (markFrom !== null && markFrom !== undefined) {
      const from = Math.min(markFrom, playhead);
      const to = Math.max(markFrom, playhead);
      paint.fillStyle = "rgba(62, 207, 142, 0.22)";
      paint.fillRect(xOf(from), 0, Math.max(1, xOf(to) - xOf(from)), height);
      paint.fillStyle = "#3ecf8e";
      paint.fillRect(Math.min(width - 2, xOf(markFrom)), 0, 2, height);
    }

    // The playhead last, so it is never buried under anything.
    if (playhead > 0) {
      paint.fillStyle = "#e8eaed";
      paint.fillRect(Math.min(width - 2, xOf(playhead)), 0, 2, height);
    }
  }, [loudness, duration, cuts, trimStart, trimEnd, playhead, markFrom, slicesPerSecond]);

  /**
   * Scrubbing, by dragging.
   *
   * Aaron: "I should be able to touch it and scroll where i want he cut
   * to happen". A tap alone makes you guess and tap again; dragging lets
   * you hunt for the exact spot while watching the picture move.
   *
   * Pointer events rather than touch events so one path covers a thumb
   * and a mouse, with the pointer captured so a finger that slides off
   * the strip keeps scrubbing instead of stopping dead. touch-none stops
   * the page from scrolling underneath while he drags.
   */
  const scrub = (clientX: number, target: HTMLCanvasElement) => {
    const box = target.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - box.left) / box.width));
    onSeek(ratio * duration);
  };

  return (
    <canvas
      ref={canvasRef}
      // Tall enough to hit with a thumb, which is how he will use it.
      className="h-20 w-full touch-none cursor-pointer rounded-lg bg-panel-2"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        scrub(e.clientX, e.currentTarget);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          scrub(e.clientX, e.currentTarget);
        }
      }}
      onPointerUp={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      }}
    />
  );
}
