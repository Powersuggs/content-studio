"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ListTree, Loader2, PenLine, Check, ChevronUp, ChevronDown,
  Trash2, Plus, Download, AlertCircle,
} from "lucide-react";
import MicButton from "@/components/voice/MicButton";
import { countWords, type Book, type Chapter } from "@/lib/books/types";
import {
  addChapterAction, deleteChapterAction, moveChapterAction,
  saveChapterBodyAction, updateBookAction, updateChapterAction,
} from "@/app/books/actions";

/**
 * Working on one book.
 *
 * The outline and the prose are deliberately on the same screen. A book
 * is written by moving between "what is this chapter for" and "what does
 * it say", and putting those on two pages makes the second one drift
 * away from the first.
 *
 * Only one chapter is open at a time. Twelve open textareas is a page
 * nobody can find anything in, and on a phone it is unusable.
 */
export default function BookWorkspace({
  book,
  chapters,
}: {
  book: Book;
  chapters: Chapter[];
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<number | null>(null);
  const [premise, setPremise] = useState(book.premise ?? "");
  const [audience, setAudience] = useState(book.audience ?? "");
  const [outlining, setOutlining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [pending, start] = useTransition();

  const drafted = chapters.filter((c) => countWords(c.body) > 0).length;
  const words = chapters.reduce((n, c) => n + countWords(c.body), 0);

  async function outline() {
    setError(null);
    setMessage(null);
    setOutlining(true);
    try {
      const res = await fetch("/api/book-outline", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bookId: book.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Could not outline that.");
      setMessage(
        data.kept > 0
          ? `Added ${data.added} chapters. Kept the ${data.kept} you have already written.`
          : `Added ${data.added} chapters.`,
      );
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not outline that.");
    } finally {
      setOutlining(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-text">{book.title}</h1>
        {book.subtitle && <p className="text-sm text-muted">{book.subtitle}</p>}
        <p className="mt-1 text-xs text-faint">
          {chapters.length} chapters, {drafted} written, {words.toLocaleString()} words
        </p>
      </div>

      {/* The premise, which is what every chapter gets drafted against. */}
      <div className="space-y-2 rounded-xl border border-border bg-panel p-3">
        <p className="text-xs text-faint">What it argues</p>
        <div className="flex items-start gap-2">
          <textarea
            value={premise}
            onChange={(e) => setPremise(e.target.value)}
            onBlur={() =>
              start(async () => {
                try {
                  await updateBookAction(book.id, { premise });
                } catch (e) {
                  setError(e instanceof Error ? e.message : "That did not save.");
                }
              })
            }
            rows={3}
            placeholder="Say it out loud, the way you would to someone across a table."
            className="min-w-0 flex-1 resize-none rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-text outline-none focus:border-accent"
          />
          <MicButton value={premise} onChange={setPremise} onError={setError} label="" size="sm" />
        </div>
        <p className="text-xs text-faint">Who it is for</p>
        <div className="flex items-start gap-2">
          <textarea
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            onBlur={() =>
              start(async () => {
                try {
                  await updateBookAction(book.id, { audience });
                } catch (e) {
                  setError(e instanceof Error ? e.message : "That did not save.");
                }
              })
            }
            rows={2}
            className="min-w-0 flex-1 resize-none rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-text outline-none focus:border-accent"
          />
          <MicButton value={audience} onChange={setAudience} onError={setError} label="" size="sm" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={outline}
          disabled={outlining || !premise.trim()}
          className="inline-flex h-11 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-bg disabled:opacity-40"
        >
          {outlining ? <Loader2 size={16} className="animate-spin" /> : <ListTree size={16} />}
          {chapters.length === 0 ? "Outline it" : "Outline again"}
        </button>
        {drafted > 0 && (
          <a
            href={`/api/book-export?id=${book.id}`}
            className="inline-flex h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm text-muted"
          >
            <Download size={15} />
            Download
          </a>
        )}
        {message && <span className="text-xs text-muted">{message}</span>}
      </div>

      {error && (
        <p className="flex items-start gap-1.5 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}

      {chapters.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-faint">
          No chapters yet. Say what the book argues, then press Outline it.
        </p>
      ) : (
        <ul className="space-y-2">
          {chapters.map((c, i) => (
            <ChapterRow
              key={c.id}
              book={book}
              chapter={c}
              first={i === 0}
              last={i === chapters.length - 1}
              open={openId === c.id}
              onToggle={() => setOpenId((v) => (v === c.id ? null : c.id))}
              onError={setError}
            />
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-panel p-3">
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Add a chapter"
          className="min-w-0 flex-1 rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-text outline-none focus:border-accent"
        />
        <button
          type="button"
          disabled={pending || !newTitle.trim()}
          onClick={() =>
            start(async () => {
              try {
                await addChapterAction(book.id, newTitle);
                setNewTitle("");
              } catch (e) {
                setError(e instanceof Error ? e.message : "That did not save.");
              }
            })
          }
          className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-accent px-3 text-sm text-accent disabled:opacity-40"
        >
          <Plus size={15} /> Add
        </button>
      </div>
    </div>
  );
}

function ChapterRow({
  book, chapter, first, last, open, onToggle, onError,
}: {
  book: Book;
  chapter: Chapter;
  first: boolean;
  last: boolean;
  open: boolean;
  onToggle: () => void;
  onError: (m: string | null) => void;
}) {
  const router = useRouter();
  const [summary, setSummary] = useState(chapter.summary ?? "");
  const [body, setBody] = useState(chapter.body ?? "");
  const [writing, setWriting] = useState(false);
  const [notes, setNotes] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  const words = countWords(body);

  async function write() {
    onError(null);
    setNotes(null);
    setWriting(true);
    try {
      const res = await fetch("/api/book-chapter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chapterId: chapter.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Could not write that chapter.");
      if (data.notes) setNotes(String(data.notes));
      router.refresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not write that chapter.");
    } finally {
      setWriting(false);
    }
  }

  return (
    <li className="rounded-xl border border-border bg-panel p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-left">
          <span className="text-sm font-medium text-text">
            {chapter.position}. {chapter.title}
          </span>
          <span className="block text-xs text-faint">
            {words > 0 ? `${words.toLocaleString()} words` : "not written yet"}
            {chapter.status === "done" && ", done"}
          </span>
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={first || pending}
            aria-label="Move up"
            onClick={() =>
              start(() => moveChapterAction(book.id, chapter.id, "up").catch(() => {}))
            }
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted disabled:opacity-30"
          >
            <ChevronUp size={14} />
          </button>
          <button
            type="button"
            disabled={last || pending}
            aria-label="Move down"
            onClick={() =>
              start(() => moveChapterAction(book.id, chapter.id, "down").catch(() => {}))
            }
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted disabled:opacity-30"
          >
            <ChevronDown size={14} />
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          <p className="text-xs text-faint">What this chapter does</p>
          <div className="flex items-start gap-2">
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              onBlur={() =>
                start(async () => {
                  try {
                    await updateChapterAction(book.id, chapter.id, { summary });
                  } catch (e) {
                    onError(e instanceof Error ? e.message : "That did not save.");
                  }
                })
              }
              rows={3}
              className="min-w-0 flex-1 resize-none rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-text outline-none focus:border-accent"
            />
            <MicButton value={summary} onChange={setSummary} onError={onError} label="" size="sm" />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={write}
              disabled={writing}
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-bg disabled:opacity-40"
            >
              {writing ? <Loader2 size={16} className="animate-spin" /> : <PenLine size={16} />}
              {words > 0 ? "Write it again" : "Write this chapter"}
            </button>
            <button
              type="button"
              disabled={pending || words === 0}
              onClick={() =>
                start(async () => {
                  try {
                    await updateChapterAction(book.id, chapter.id, {
                      status: chapter.status === "done" ? "drafted" : "done",
                    });
                  } catch (e) {
                    onError(e instanceof Error ? e.message : "That did not save.");
                  }
                })
              }
              className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-muted disabled:opacity-40"
            >
              <Check size={15} />
              {chapter.status === "done" ? "Not done after all" : "Mark done"}
            </button>
          </div>

          {writing && (
            <p className="text-xs text-faint">
              A chapter takes a minute or two. Leave this open.
            </p>
          )}
          {notes && (
            <p className="rounded-lg border border-border bg-panel-2 px-3 py-2 text-xs text-muted">
              {notes}
            </p>
          )}

          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onBlur={() =>
              start(async () => {
                try {
                  await saveChapterBodyAction(book.id, chapter.id, body);
                } catch (e) {
                  onError(e instanceof Error ? e.message : "That did not save.");
                }
              })
            }
            rows={16}
            placeholder="The chapter goes here. Write it yourself, or press the button."
            className="w-full resize-y rounded-lg border border-border bg-panel-2 px-3 py-2 font-mono text-[13px] leading-relaxed text-text outline-none focus:border-accent"
          />

          <div className="flex items-center">
            {confirming ? (
              <span className="ml-auto flex items-center gap-2 text-[11px]">
                <span className="text-warn">Delete this chapter and its writing?</span>
                <button
                  type="button"
                  onClick={() =>
                    start(() => deleteChapterAction(book.id, chapter.id).catch(() => {}))
                  }
                  className="rounded-full border border-warn px-2 py-1 text-warn"
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="rounded-full border border-border px-2 py-1 text-muted"
                >
                  Keep
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="ml-auto flex h-9 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[11px] text-muted"
              >
                <Trash2 size={12} /> Delete chapter
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
