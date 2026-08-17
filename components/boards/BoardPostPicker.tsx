"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { togglePostInBoardAction } from "@/app/boards/actions";

export interface PickerPost {
  id: number;
  thumb_url: string | null;
  caption: string | null;
  in_board: boolean;
}

export default function BoardPostPicker({
  boardId,
  posts,
}: {
  boardId: number;
  posts: PickerPost[];
}) {
  const [state, setState] = useState(new Map(posts.map((p) => [p.id, p.in_board])));
  const [, startTransition] = useTransition();

  function toggle(postId: number) {
    const next = new Map(state);
    next.set(postId, !state.get(postId));
    setState(next);
    startTransition(async () => {
      await togglePostInBoardAction(boardId, postId);
    });
  }

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
      {posts.map((post) => {
        const inBoard = state.get(post.id);
        return (
          <button
            key={post.id}
            type="button"
            onClick={() => toggle(post.id)}
            className="group relative aspect-[9/16] overflow-hidden rounded-lg border border-border"
          >
            {post.thumb_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={post.thumb_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-panel-2 text-[10px] text-faint">
                No thumb
              </div>
            )}
            <div
              className={`absolute inset-0 flex items-start justify-end p-1.5 transition-colors ${
                inBoard ? "bg-accent/25" : "bg-black/0 group-hover:bg-black/20"
              }`}
            >
              <div
                className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                  inBoard
                    ? "border-accent bg-accent text-bg"
                    : "border-white/60 bg-black/40 text-transparent"
                }`}
              >
                <Check size={12} />
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
