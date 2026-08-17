"use server";

import { revalidatePath } from "next/cache";
import { createBoard, togglePostInBoard } from "@/lib/queries";

export async function createBoardAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const description = String(formData.get("description") ?? "").trim() || null;
  const board = await createBoard(name, description);
  revalidatePath("/boards");
  return board.id;
}

export async function togglePostInBoardAction(boardId: number, postId: number) {
  const result = await togglePostInBoard(boardId, postId);
  revalidatePath(`/boards/${boardId}`);
  return result;
}
