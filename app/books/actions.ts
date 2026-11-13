"use server";

import { revalidatePath } from "next/cache";
import {
  addChapter,
  createBook,
  deleteBook,
  deleteChapter,
  moveChapter,
  saveChapterBody,
  updateBook,
  updateChapter,
  type BookStatus,
  type ChapterStatus,
} from "@/lib/books/queries";

export async function createBookAction(input: {
  title: string;
  subtitle?: string;
  premise?: string;
  audience?: string;
}): Promise<{ id: number }> {
  const id = await createBook(input);
  revalidatePath("/books");
  return { id };
}

export async function updateBookAction(
  bookId: number,
  input: {
    title?: string;
    subtitle?: string | null;
    premise?: string | null;
    audience?: string | null;
    status?: BookStatus;
  },
): Promise<void> {
  await updateBook(bookId, input);
  revalidatePath(`/books/${bookId}`);
  revalidatePath("/books");
}

export async function deleteBookAction(bookId: number): Promise<void> {
  await deleteBook(bookId);
  revalidatePath("/books");
}

export async function addChapterAction(
  bookId: number,
  title: string,
  summary?: string,
): Promise<void> {
  await addChapter(bookId, title, summary);
  revalidatePath(`/books/${bookId}`);
}

export async function updateChapterAction(
  bookId: number,
  chapterId: number,
  input: { title?: string; summary?: string | null; status?: ChapterStatus },
): Promise<void> {
  await updateChapter(chapterId, input);
  revalidatePath(`/books/${bookId}`);
}

export async function saveChapterBodyAction(
  bookId: number,
  chapterId: number,
  body: string,
): Promise<void> {
  await saveChapterBody(chapterId, body);
  revalidatePath(`/books/${bookId}`);
}

export async function moveChapterAction(
  bookId: number,
  chapterId: number,
  direction: "up" | "down",
): Promise<void> {
  await moveChapter(chapterId, direction);
  revalidatePath(`/books/${bookId}`);
}

export async function deleteChapterAction(
  bookId: number,
  chapterId: number,
): Promise<void> {
  await deleteChapter(chapterId);
  revalidatePath(`/books/${bookId}`);
}
