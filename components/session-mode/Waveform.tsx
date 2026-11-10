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
 *
 * Two things he asked for after using it:
 *
 *   "I am not seeing anythig that is being cut ... make sure the cut out
 *   pieces are in red highlight so we can see whats getting cut out of
 *   the video"
 *
 * The removed stretches were shaded a polite amber at about a sixth
 * opacity, which on a phone in daylight is close to invisible. They are
 * red now, and loud about it: a red wash, red bars, and a red edge at
 * each end of the cut.
 *
 *   "when i place the cut i need to be able to zoom into it to get it
 *   closer to get the right frame if i am doing by hand"
 *
 * So the strip can be zoomed, and when it is, it follows the playhead.
 * A whole minute across three hundred pixels is about a fifth of a second
 * per pixel, which is no use for placing a cut by hand.
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
  zoom = 1,
  onSeek,
}: {
  loudness: number[];
  slicesPerSecond: number;
  duration: number;
  /** Stretches being removed, shown in red. */
  cuts: Span[];
  trimStart: number;
  trimEnd: number;
  /** Where playback is, in seconds. */
  playhead: number;
  /** Where a cut he is marking by hand begins, if he is marking one. */
  markFrom?: number | null;
  /** 1 shows the whole piece; 8 shows an eighth of it around the playhead. */
  zoom?: number;
  onSeek: (seconds: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  /**
   * The stretch of time on screen.
   *
   * Kept centred on the playhead when zoomed in, and clamped so the view
   * never runs off either end of the piece.
   */
  const span = duration / Math.max(1, zoom);
  const from = Math.max(0, Math.min(playhead - span / 2, duration - span));
  const to = from + span;

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

    const xOf = (seconds: number) => ((seconds - from) / span) * width;
    const middle = height / 2;
    let peak = 0;
    for (const v of loudness) if (v > peak) peak = v;
    const scale = peak > 0 ? (height / 2 - 2) / peak : 0;

    const removed: Span[] = [
      ...(trimStart > 0 ? [{ start: 0, end: trimStart }] : []),
      ...cuts,
      ...(trimEnd > 0 ? [{ start: duration - trimEnd, end: duration }] : []),
    ];

    // Everything being removed, washed red, with a solid line down each
    // edge so a cut too narrow to shade is still obvious.
    for (const piece of removed) {
      const left = xOf(piece.start);
      const right = xOf(piece.end);
      if (right < 0 || left > width) continue;
      paint.fillStyle = "rgba(239, 68, 68, 0.30)";
      paint.fillRect(left, 0, Math.max(1, right - left), height);
      paint.fillStyle = "rgba(239, 68, 68, 0.9)";
      paint.fillRect(left, 0, 1.5, height);
      paint.fillRect(right - 1.5, 0, 1.5, height);
    }

    // One bar per pixel column, taking the loudest reading in that column
    // so a quiet gap cannot be hidden by averaging it with speech.
    for (let x = 0; x < width; x++) {
      const seconds = from + (x / width) * span;
      const nextSeconds = from + ((x + 1) / width) * span;
      const i0 = Math.floor(seconds * slicesPerSecond);
      const i1 = Math.max(i0 + 1, Math.floor(nextSeconds * slicesPerSecond));
      let loudest = 0;
      for (let i = i0; i < i1 && i < loudness.length; i++) {
        if (i >= 0 && loudness[i] > loudest) loudest = loudness[i];
      }
      const isRemoved = removed.some((s) => seconds >= s.start && seconds < s.end);
      const bar = Math.max(1, loudest * scale);
      paint.fillStyle = isRemoved ? "rgba(248, 113, 113, 0.85)" : "#3ecf8e";
      paint.fillRect(x, middle - bar, 1, bar * 2);
    }

    // The start of a cut being marked, and the stretch it covers so far,
    // so he can see what he is about to remove before he commits to it.
    if (markFrom !== null && markFrom !== undefined) {
      const a = Math.min(markFrom, playhead);
      const b = Math.max(markFrom, playhead);
      paint.fillStyle = "rgba(239, 68, 68, 0.22)";
      paint.fillRect(xOf(a), 0, Math.max(1, xOf(b) - xOf(a)), height);
      paint.fillStyle = "#ef4444";
      paint.fillRect(xOf(markFrom) - 1, 0, 2, height);
    }

    // The playhead last, so it is never buried under anything.
    paint.fillStyle = "#e8eaed";
    paint.fillRect(Math.max(0, Math.min(width - 2, xOf(playhead))), 0, 2, height);
  }, [
    loudness, duration, cuts, trimStart, trimEnd, playhead, markFrom,
    slicesPerSecond, from, span,
  ]);

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
    onSeek(from + ratio * span);
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
