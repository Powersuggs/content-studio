import Link from "next/link";
import { Layers } from "lucide-react";
import { getBoardsList } from "@/lib/queries";
import NewBoardForm from "@/components/boards/NewBoardForm";

export default async function BoardsPage() {
  const boards = await getBoardsList();

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-lg font-semibold text-text">Discover Boards</h1>
        <p className="mt-1 text-sm text-muted">Named collections of your posts.</p>
      </div>

      <NewBoardForm />

      {boards.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-sm text-faint">
          No boards yet -- create one above.
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {boards.map((board) => (
            <li key={board.id}>
              <Link
                href={`/boards/${board.id}`}
                className="flex items-center gap-3 rounded-lg border border-border bg-panel p-4 hover:border-accent/50"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-idea/15 text-idea">
                  <Layers size={16} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text">{board.name}</p>
                  <p className="text-xs text-faint">{board.post_count} posts</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
