import { getReferencePostsGroupedByHandle } from "@/lib/queries";

export default async function InspirationPage() {
  const grouped = await getReferencePostsGroupedByHandle();
  const handles = Object.keys(grouped);

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-4 md:p-8">
      <div>
        <h1 className="text-lg font-semibold text-text">Inspiration</h1>
        <p className="mt-1 text-sm text-muted">
          Reference posts imported from other creators -- kept separate from your own stats.
        </p>
      </div>

      {handles.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-sm text-faint">
          No reference posts imported yet.
        </div>
      ) : (
        handles.map((handle) => (
          <section key={handle}>
            <h2 className="mb-3 text-sm font-semibold text-text">@{handle}</h2>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {grouped[handle].map((post) => (
                <a
                  key={post.id}
                  href={post.url ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="flex w-40 shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-panel hover:border-accent/50"
                >
                  <div className="aspect-[9/16] w-full bg-panel-2">
                    {post.thumb_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={post.thumb_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-faint">
                        No thumbnail
                      </div>
                    )}
                  </div>
                  <div className="p-2.5">
                    <p className="line-clamp-2 text-xs text-text">{post.caption || "No caption"}</p>
                    <p className="mt-1 text-[11px] text-muted">
                      {post.views.toLocaleString()} views · {post.happened_on}
                    </p>
                  </div>
                </a>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
