import { getBoardTogglePosts, getBoardsList } from "@/lib/queries";
import BoardPostPicker from "@/components/boards/BoardPostPicker";

export default async function BoardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const boardId = Number(id);
  const [posts, boards] = await Promise.all([
    getBoardTogglePosts(boardId),
    getBoardsList(),
  ]);
  const board = boards.find((b) => b.id === boardId);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-lg font-semibold text-text">{board?.name ?? "Board"}</h1>
        <p className="mt-1 text-sm text-muted">
          Tap a post to add or remove it from this board.
        </p>
      </div>
      {posts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-sm text-faint">
          No posts to pick from yet.
        </div>
      ) : (
        <BoardPostPicker boardId={boardId} posts={posts} />
      )}
    </div>
  );
}
