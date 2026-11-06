import { listIdeas, countIdeas, type IdeaFilter } from "@/lib/ideas/queries";
import IdeaCapture from "@/components/ideas/IdeaCapture";
import IdeaList from "@/components/ideas/IdeaList";

export const dynamic = "force-dynamic";

const FILTERS: { id: IdeaFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "in-progress", label: "In progress" },
  { id: "untouched", label: "Untouched" },
];

export default async function IdeasPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const params = await searchParams;
  const filter = (FILTERS.find((f) => f.id === params.filter)?.id ??
    "all") as IdeaFilter;

  // Swallowing the error here and showing an empty list was wrong: a
  // database that has not had the migration run looked exactly like a
  // pipeline with nothing in it, so the page cheerfully said "no ideas
  // yet" when the table did not exist. An empty pipeline and a broken
  // install need to read differently, because only one of them is the
  // user's move to make.
  let ideas: Awaited<ReturnType<typeof listIdeas>> = [];
  let counts = { total: 0, untouched: 0 };
  let setupError: string | null = null;

  try {
    [ideas, counts] = await Promise.all([listIdeas(filter), countIdeas()]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // 42P01 is Postgres for "relation does not exist".
    setupError = /does not exist|42P01/i.test(message)
      ? "This page needs a database table that is not there yet. Run migrations/0016_ideas.sql against your database and reload."
      : "Could not load your ideas. The database did not answer.";
    console.error("[ideas] load failed:", err);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-lg font-semibold text-text">Ideas</h1>
        <p className="mt-1 text-sm text-muted">
          Catch the thought before it is a script. One idea is usually worth
          several posts in different shapes, and this is the list of which
          ones you have not made yet.
        </p>
      </div>

      {setupError && (
        <p className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
          {setupError}
        </p>
      )}

      {!setupError && <IdeaCapture />}

      {!setupError && counts.total > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <a
              key={f.id}
              href={f.id === "all" ? "/ideas" : `/ideas?filter=${f.id}`}
              className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                filter === f.id
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border text-muted hover:border-accent hover:text-accent"
              }`}
            >
              {f.label}
            </a>
          ))}
          <span className="ml-auto text-xs text-faint">
            {counts.total} idea{counts.total === 1 ? "" : "s"}
            {counts.untouched > 0 && ` · ${counts.untouched} untouched`}
          </span>
        </div>
      )}

      {!setupError && (
        <IdeaList ideas={ideas} emptyFilter={filter} hasAny={counts.total > 0} />
      )}
    </div>
  );
}
