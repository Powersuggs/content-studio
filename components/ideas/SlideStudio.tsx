"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Download, Check, Loader2, ImageOff, Smartphone } from "lucide-react";
import {
  LAYOUTS,
  THEMES,
  layoutAccepts,
  type LayoutId,
  type PhotoKind,
} from "@/lib/slides/design";
import {
  reconcile,
  slideUrl,
  suggestAccent,
  type CarouselPlan,
} from "@/lib/slides/plan";
import { saveSlidePlanAction } from "@/app/ideas/actions";

export interface PhotoChoice {
  id: number;
  label: string | null;
  /** How many slides already use it. Drives the default ordering. */
  uses: number;
  /** person or scene. Decides which layouts may hold it. */
  kind: PhotoKind;
}

/**
 * Turning a written carousel into pictures.
 *
 * Three decisions per slide: layout, photo, accent phrase. They are made
 * here rather than guessed, because guessing which photograph suits which
 * sentence, from a filename, gets it wrong often enough to be worse than
 * an empty slot.
 *
 * Every preview is just an <img> pointed at the renderer, so what you see
 * while choosing is the exact file you download. There is no separate
 * preview path that could drift from the real one.
 */
export default function SlideStudio({
  ideaId,
  format,
  title,
  parts,
  sub,
  photos,
  handle,
  initialPlan,
}: {
  ideaId: number;
  format: string;
  title: string;
  parts: string[];
  sub: string;
  photos: PhotoChoice[];
  handle: string | null;
  initialPlan: CarouselPlan | null;
}) {
  const lines = useMemo(() => [title, ...parts].filter(Boolean), [title, parts]);
  // photos arrives least-used first, so handing it straight through is
  // what makes a new carousel rotate through the bank. The kind travels
  // with it so the planner never puts a face in a letterbox.
  const refs = useMemo(() => photos.map((p) => ({ id: p.id, kind: p.kind })), [photos]);
  const [plan, setPlan] = useState<CarouselPlan>(() =>
    reconcile(initialPlan, lines.length, refs),
  );
  const [active, setActive] = useState(0);
  const [saved, setSaved] = useState(false);
  const [downloading, setDownloading] = useState<number | null>(null);
  const [downloadNote, setDownloadNote] = useState<string | null>(null);
  // The slides as real files, held so the share can happen inside the tap
  // that asks for it. See prepareForPhone below for why that matters.
  const [phoneFiles, setPhoneFiles] = useState<File[] | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [canSharePhotos, setCanSharePhotos] = useState(false);
  const [, startTransition] = useTransition();
  const firstRun = useRef(true);

  // Seed an accent on each slide the first time this is opened, so the
  // deck arrives looking like the reference rather than flat white text.
  useEffect(() => {
    if (initialPlan) return;
    setPlan((p) => ({
      ...p,
      slides: p.slides.map((s, i) => ({ ...s, accent: s.accent || suggestAccent(lines[i] ?? "") })),
    }));
  }, [initialPlan, lines]);

  // Persist quietly a moment after the last change rather than on every
  // keystroke, which would be a write per letter typed into the accent box.
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const t = setTimeout(() => {
      startTransition(async () => {
        await saveSlidePlanAction(ideaId, format, plan);
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      });
    }, 900);
    return () => clearTimeout(t);
  }, [plan, ideaId, format]);

  function set(i: number, patch: Partial<CarouselPlan["slides"][number]>) {
    setPlan((p) => ({
      ...p,
      slides: p.slides.map((s, j) => (j === i ? { ...s, ...patch } : s)),
    }));
  }

  const urlFor = (i: number) =>
    slideUrl({
      text: lines[i] ?? "",
      // Only ever text meant for the reader. The draft's notes field is
      // direction for whoever makes the slide ("big numbers, one per
      // slide") and printing it was putting stage directions on the post.
      sub: i === 0 ? sub : "",
      plan: plan.slides[i],
      theme: plan.theme,
      logo: plan.logo,
      index: i + 1,
      total: lines.length,
      handle,
    });

  // Only phones have somewhere to share a photo TO. Asked rather than
  // guessed from the user agent, with a real file, because a browser that
  // has navigator.share may still refuse files.
  useEffect(() => {
    try {
      const probe = new File([new Blob([new Uint8Array([0])])], "probe.png", {
        type: "image/png",
      });
      setCanSharePhotos(
        typeof navigator !== "undefined" &&
          typeof navigator.share === "function" &&
          typeof navigator.canShare === "function" &&
          navigator.canShare({ files: [probe] }),
      );
    } catch {
      setCanSharePhotos(false);
    }
  }, []);

  /**
   * Two taps, on purpose.
   *
   * iOS will only open a share sheet inside the tap that asked for one.
   * Fetching eight slides first breaks that: by the time the files exist
   * the tap is over, and Safari refuses. So the first tap fetches and the
   * second shares, which is one more tap than ideal and the difference
   * between working and not.
   */
  async function prepareForPhone() {
    setPreparing(true);
    setDownloadNote(null);
    const files: File[] = [];
    for (let i = 0; i < lines.length; i++) {
      try {
        const res = await fetch(urlFor(i));
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        files.push(
          new File([blob], `slide-${String(i + 1).padStart(2, "0")}.png`, {
            type: "image/png",
          }),
        );
      } catch {
        /* a missing slide is reported below rather than stopping the rest */
      }
    }
    setPreparing(false);
    if (files.length === 0) {
      setDownloadNote("Could not fetch the slides. Check your connection and try again.");
      return;
    }
    setPhoneFiles(files);
    setDownloadNote(
      files.length < lines.length
        ? `${files.length} of ${lines.length} slides are ready. Tap again to send them to your photos.`
        : "Ready. Tap again, then choose Save to Photos.",
    );
  }

  async function shareToPhone() {
    if (!phoneFiles) return;
    try {
      await navigator.share({ files: phoneFiles, title: "Carousel slides" });
      setDownloadNote("Sent. Choose Save to Photos and they land in your camera roll in order.");
    } catch (err) {
      // Dismissing the sheet throws too, and that is not a failure worth
      // shouting about.
      if ((err as Error)?.name !== "AbortError") {
        setDownloadNote("Your phone would not accept the share. Use Download all instead.");
      }
    }
  }

  // A slide changed, so the files in hand are the old ones. Dropping them
  // turns the button back into "Save to my photos", which is better than
  // silently sending the version he just edited away from.
  useEffect(() => {
    setPhoneFiles(null);
  }, [plan]);

  async function downloadAll() {
    // One at a time, named in order, so they land in the right sequence in
    // the download folder and can be selected straight into Instagram.
    //
    // Failures are counted rather than swallowed. A slide that does not
    // save is a slide missing from the post, and finding that out while
    // uploading to Instagram is finding out too late. The loop still
    // keeps going: seven slides and a warning beats one slide and a stop.
    setDownloadNote(null);
    let failed = 0;
    for (let i = 0; i < lines.length; i++) {
      setDownloading(i);
      try {
        const res = await fetch(urlFor(i));
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `slide-${String(i + 1).padStart(2, "0")}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(a.href);
        await new Promise((r) => setTimeout(r, 400));
      } catch {
        failed++;
      }
    }
    setDownloading(null);
    if (failed === lines.length) {
      setDownloadNote(
        "None of the slides saved. If your browser asked whether this site may download several files, say yes and try again.",
      );
    } else if (failed > 0) {
      setDownloadNote(
        `${failed} of ${lines.length} slides did not save. Check your downloads folder before you post, and use "Download just this one" for the missing ones.`,
      );
    } else {
      // Said plainly, because the browser gives no feedback of its own and
      // a silent finish is indistinguishable from nothing happening.
      setDownloadNote(
        `All ${lines.length} slides saved to your downloads folder as slide-01 to slide-${String(lines.length).padStart(2, "0")}.`,
      );
    }
  }

  if (lines.length === 0) return null;
  const cur = plan.slides[active];

  return (
    <div className="space-y-4 rounded-lg border border-border bg-panel-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-text">
          Slides
          <span className="ml-2 font-normal text-faint">
            {lines.length} to post
          </span>
        </p>
        <div className="flex items-center gap-2">
          {saved && <span className="text-[11px] text-accent">Saved</span>}
          {/* The mark goes on when he says so. Colours carry the brand on
              every slide either way, which is the quieter half of it and
              the half that does not need asking about. */}
          <label className="inline-flex items-center gap-1.5 text-[11px] text-muted">
            <input
              type="checkbox"
              checked={plan.logo}
              onChange={(e) => setPlan((p) => ({ ...p, logo: e.target.checked }))}
              className="h-3 w-3 accent-current"
            />
            Logo on first and last
          </label>
          <select
            value={plan.theme}
            onChange={(e) => setPlan((p) => ({ ...p, theme: e.target.value }))}
            className="rounded-lg border border-border bg-panel px-2 py-1 text-[11px] text-text outline-none"
          >
            {THEMES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={downloadAll}
            disabled={downloading !== null}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1.5 text-[11px] font-medium text-bg disabled:opacity-50"
          >
            {downloading !== null ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Download size={12} />
            )}
            {downloading !== null ? `Saving ${downloading + 1}` : "Download all"}
          </button>
          {canSharePhotos && (
            <button
              type="button"
              onClick={phoneFiles ? shareToPhone : prepareForPhone}
              disabled={preparing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-accent px-2.5 py-1.5 text-[11px] font-medium text-accent disabled:opacity-50"
            >
              {preparing ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Smartphone size={12} />
              )}
              {preparing
                ? "Getting them ready"
                : phoneFiles
                  ? "Send to Photos"
                  : "Save to my photos"}
            </button>
          )}
        </div>
      </div>

      {downloadNote && (
        <p
          className={`text-[11px] ${
            /did not save|None of the slides/.test(downloadNote) ? "text-warn" : "text-faint"
          }`}
        >
          {downloadNote}
        </p>
      )}

      {/* The strip: every slide at a glance, which is how you spot that
          three in a row look the same. */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {lines.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setActive(i)}
            className={`shrink-0 overflow-hidden rounded-md border ${
              active === i ? "border-accent" : "border-border"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={urlFor(i)} alt={`Slide ${i + 1}`} width={72} height={90} loading="lazy" />
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={urlFor(active)}
          alt={`Slide ${active + 1}`}
          className="w-full rounded-lg border border-border"
        />

        <div className="space-y-2.5">
          <p className="text-[11px] text-faint">
            Slide {active + 1}: {lines[active]?.slice(0, 70)}
            {(lines[active]?.length ?? 0) > 70 ? "…" : ""}
          </p>

          <div>
            <p className="mb-1 text-[10px] uppercase tracking-wide text-faint">Layout</p>
            <div className="flex flex-wrap gap-1">
              {LAYOUTS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  title={l.hint}
                  onClick={() =>
                    set(active, {
                      layout: l.id as LayoutId,
                      photoId:
                        l.id === "plain"
                          ? null
                          : keepsOrSwaps(l.id as LayoutId, cur.photoId, photos),
                    })
                  }
                  className={`rounded-lg border px-2 py-1 text-[11px] ${
                    cur.layout === l.id
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border text-muted hover:border-accent hover:text-accent"
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-faint">
              Photo
              {cur.layout === "plain" && (
                <span className="inline-flex items-center gap-1 text-faint">
                  <ImageOff size={10} /> not used on a text-only slide
                </span>
              )}
              {cur.layout === "band" && (
                <span className="text-faint">places and objects only</span>
              )}
            </p>
            {photos.length === 0 ? (
              <p className="text-[11px] text-faint">
                No photos yet. Add some on the Photos page.
              </p>
            ) : (
              <select
                value={cur.photoId ?? ""}
                disabled={cur.layout === "plain"}
                onChange={(e) =>
                  set(active, { photoId: e.target.value ? Number(e.target.value) : null })
                }
                className="w-full rounded-lg border border-border bg-panel px-2 py-1.5 text-[11px] text-text outline-none focus:border-accent"
              >
                {photos
                  .filter((p) => layoutAccepts(cur.layout, p.kind))
                  .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label || `Photo ${p.id}`}
                    {p.uses > 0 ? `  (used ${p.uses}\u00d7)` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <p className="mb-1 text-[10px] uppercase tracking-wide text-faint">
              Words in red
            </p>
            <input
              value={cur.accent}
              onChange={(e) => set(active, { accent: e.target.value })}
              placeholder="a phrase from this slide"
              className="w-full rounded-lg border border-border bg-panel px-2 py-1.5 text-[11px] text-text outline-none focus:border-accent"
            />
            <p className="mt-1 text-[10px] text-faint">
              Must appear in the slide text. Anything else is ignored.
            </p>
          </div>

          <button
            type="button"
            onClick={async () => {
              setDownloading(active);
              const res = await fetch(urlFor(active));
              const blob = await res.blob();
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = `slide-${String(active + 1).padStart(2, "0")}.png`;
              document.body.appendChild(a);
              a.click();
              a.remove();
              URL.revokeObjectURL(a.href);
              setDownloading(null);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] text-muted hover:border-accent hover:text-accent"
          >
            <Check size={11} /> Download just this one
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Keeps the current photo if the new shape can hold it, otherwise picks
 * the least-used one that can. Switching a slide to the band while a
 * headshot is on it would otherwise crop the face off.
 */
function keepsOrSwaps(
  layout: LayoutId,
  current: number | null,
  photos: PhotoChoice[],
): number | null {
  const cur = photos.find((p) => p.id === current);
  if (cur && layoutAccepts(layout, cur.kind)) return cur.id;
  return photos.find((p) => layoutAccepts(layout, p.kind))?.id ?? null;
}
