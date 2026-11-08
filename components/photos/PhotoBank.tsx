"use client";

import { useRef, useState, useTransition } from "react";
import { ImagePlus, Loader2, Trash2, Check, X, User, Mountain, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { downscale } from "./downscale";
import { deletePhotoAction, updatePhotoAction } from "@/app/photos/actions";

export interface PhotoView {
  id: number;
  kind: "person" | "scene";
  label: string | null;
  tags: string[];
  width: number | null;
  height: number | null;
  byteSize: number;
  source: string | null;
}

function kb(n: number) {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;
}

export default function PhotoBank({
  photos,
  totalBytes,
}: {
  photos: PhotoView[];
  totalBytes: number;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(0);
  const [sorting, setSorting] = useState(false);
  const [sortMsg, setSortMsg] = useState<string | null>(null);
  const router = useRouter();

  async function sortAll() {
    setSorting(true);
    setSortMsg(null);
    try {
      const res = await fetch("/api/photos/classify", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      setSortMsg(
        res.ok
          ? `Sorted ${data.sorted} of ${data.total}.`
          : (data?.error ?? "Could not sort them."),
      );
      if (res.ok) router.refresh();
    } catch {
      setSortMsg("Could not reach the sorter.");
    } finally {
      setSorting(false);
    }
  }

  async function upload(files: FileList) {
    setError(null);
    const list = Array.from(files);
    setBusy({ done: 0, total: list.length });
    let ok = 0;
    const failed: string[] = [];

    for (const [i, file] of list.entries()) {
      try {
        const small = await downscale(file);
        const form = new FormData();
        form.append("photo", small.blob, file.name);
        form.append("width", String(small.width));
        form.append("height", String(small.height));
        // The filename is the only label anyone has at upload time. Better
        // than blank, and easy to correct.
        form.append("label", file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "));
        const res = await fetch("/api/photos", { method: "POST", body: form });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          failed.push(`${file.name}: ${data?.error ?? "upload failed"}`);
        } else {
          ok++;
        }
      } catch (e) {
        failed.push(`${file.name}: ${e instanceof Error ? e.message : "could not be read"}`);
      }
      setBusy({ done: i + 1, total: list.length });
    }

    setBusy(null);
    // Partial success is reported as such rather than silently swallowed:
    // uploading twelve and getting eleven should say which one is missing.
    if (failed.length) setError(failed.slice(0, 3).join(" · "));
    if (ok) {
      setSaved(ok);
      setTimeout(() => setSaved(0), 2500);
      router.refresh();
    }
    if (input.current) input.current.value = "";
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3 rounded-xl border border-border bg-panel p-4">
        <div className="flex items-center gap-2">
          <ImagePlus size={18} strokeWidth={1.75} className="text-accent" />
          <h2 className="text-sm font-semibold text-text">Add photos</h2>
        </div>

        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => e.target.files?.length && upload(e.target.files)}
        />

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-bg disabled:opacity-50"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
            {busy ? `Adding ${busy.done} of ${busy.total}` : "Choose photos"}
          </button>
          {saved > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-accent">
              <Check size={13} /> {saved} added
            </span>
          )}
          {photos.length > 0 && (
            <button
              type="button"
              onClick={sortAll}
              disabled={sorting || busy !== null}
              title="Look at every photo and set whether it has a person in it, plus a name and tags"
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
            >
              {sorting ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
              {sorting ? "Looking at them…" : "Sort automatically"}
            </button>
          )}
          {sortMsg && <span className="text-xs text-muted">{sortMsg}</span>}
        </div>

        {error && <p className="text-xs text-warn">{error}</p>}

        <p className="text-xs text-faint">
          Pick as many as you like. Each one is shrunk in your browser before it is sent, so a
          big phone photo uploads in a second and does not fill the database. Mark each one
          <span className="text-muted"> Person</span> or
          <span className="text-muted"> Place</span>: a photo of someone is never put in the
          wide top strip, because that shape crops a face off. Sort automatically does it for
          you by looking at the pictures.
        </p>
      </div>

      {photos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-sm text-faint">
          No photos yet. Start with a handful of good shots of yourself, a few of the team, and
          some without people in them for slides that do not need a face.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 text-xs text-faint">
            <span>
              {photos.length} photo{photos.length === 1 ? "" : "s"}
            </span>
            <span>{kb(totalBytes)} stored</span>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {photos.map((p) => (
              <PhotoCard key={p.id} photo={p} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function PhotoCard({ photo }: { photo: PhotoView }) {
  const [label, setLabel] = useState(photo.label ?? "");
  const [tags, setTags] = useState(photo.tags.join(", "));
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();

  const dirty = label !== (photo.label ?? "") || tags !== photo.tags.join(", ");

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-panel">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="block w-full"
        title={photo.label ?? "Photo"}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/photos/${photo.id}`}
          alt={photo.label ?? ""}
          loading="lazy"
          className="aspect-[4/5] w-full object-cover"
        />
      </button>

      <div className="space-y-2 p-2.5">
        <p className="truncate text-[11px] text-muted" title={photo.label ?? ""}>
          {photo.label || "Untitled"}
        </p>
        {!open && (
          <p className="flex items-center gap-1 truncate text-[10px] text-faint">
            {photo.kind === "person" ? <User size={9} /> : <Mountain size={9} />}
            {photo.kind === "person" ? "Person" : "Place"}
            {photo.tags.length > 0 && ` · ${photo.tags.join(" · ")}`}
          </p>
        )}

        {open && (
          <div className="space-y-2">
            <div className="flex gap-1">
              {(["person", "scene"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() =>
                    startTransition(async () => {
                      await updatePhotoAction(photo.id, { kind: k });
                    })
                  }
                  disabled={isPending}
                  className={`inline-flex flex-1 items-center justify-center gap-1 rounded-lg border px-2 py-1 text-[11px] ${
                    photo.kind === k
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border text-muted hover:border-accent hover:text-accent"
                  }`}
                >
                  {k === "person" ? <User size={10} /> : <Mountain size={10} />}
                  {k === "person" ? "Person" : "Place"}
                </button>
              ))}
            </div>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="What is this photo?"
              className="w-full rounded-lg border border-border bg-panel-2 px-2 py-1.5 text-[11px] text-text outline-none focus:border-accent"
            />
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="headshot, suit, office"
              className="w-full rounded-lg border border-border bg-panel-2 px-2 py-1.5 text-[11px] text-text outline-none focus:border-accent"
            />
            <div className="flex items-center gap-1.5">
              {dirty && (
                <button
                  type="button"
                  onClick={() =>
                    startTransition(async () => {
                      await updatePhotoAction(photo.id, { label, tags });
                    })
                  }
                  disabled={isPending}
                  className="rounded-lg bg-accent px-2 py-1 text-[11px] font-medium text-bg disabled:opacity-50"
                >
                  Save
                </button>
              )}
              <span className="text-[10px] text-faint">
                {photo.width}&times;{photo.height}
              </span>
              <div className="ml-auto">
                {confirm ? (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        startTransition(async () => {
                          await deletePhotoAction(photo.id);
                        })
                      }
                      disabled={isPending}
                      className="rounded-lg border border-warn/40 bg-warn/10 px-1.5 py-1 text-[10px] text-warn"
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirm(false)}
                      className="rounded-lg border border-border p-1 text-faint"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirm(true)}
                    className="rounded-lg border border-border p-1 text-faint hover:border-warn hover:text-warn"
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
