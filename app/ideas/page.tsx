import {
  listIdeas,
  countIdeas,
  listDraftsForIdeas,
  photoUsage,
  type IdeaFilter,
} from "@/lib/ideas/queries";
import IdeaCapture from "@/components/ideas/IdeaCapture";
import SetupNotice from "@/components/SetupNotice";
import { safeLoad } from "@/lib/db-errors";
import IdeaList, { type DraftView } from "@/components/ideas/IdeaList";
import { listPhotos } from "@/lib/photos/queries";
import { getMyHandle } from "@/lib/my-handle";

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

  const [ideas, ideasError] = await safeLoad(() => listIdeas(filter), [], "ideas");
  const [counts] = await safeLoad(
    () => countIdeas(),
    { total: 0, untouched: 0 },
    "ideas",
  );
  // One query for every idea's drafts rather than one per idea. Wrapped
  // because 0020 may not have been run yet, and a missing column here
  // should cost the drafts, not the whole page.
  const [draftMap] = await safeLoad(
    () => listDraftsForIdeas(ideas.map((i) => i.id)),
    new Map<number, Awaited<ReturnType<typeof listDraftsForIdeas>> extends Map<number, infer V> ? V : never>(),
    "ideas",
  );
  const drafts: Record<number, DraftView[]> = {};
  for (const [ideaId, list] of draftMap) {
    drafts[ideaId] = list.map((d) => ({
      format: d.format,
      content: d.content,
      scriptId: d.scriptId,
      newsletterId: d.newsletterId,
    }));
  }

  // The studio needs the photo bank to choose from and the handle for the
  // slide footer. Both are guarded: a missing photos table should cost the
  // picker, not the page.
  const [photoRows] = await safeLoad(
    () => listPhotos(300),
    [] as Awaited<ReturnType<typeof listPhotos>>,
    "ideas",
  );
  // Least used first, so a new carousel reaches for the photographs that
  // have had the least airtime. Ties break on the oldest, which means a
  // freshly uploaded batch does not crowd out everything already there.
  const [usage] = await safeLoad(
    () => photoUsage(),
    new Map<number, number>(),
    "ideas",
  );
  const photos = [...photoRows]
    .sort((a, b) => {
      const ua = usage.get(a.id) ?? 0;
      const ub = usage.get(b.id) ?? 0;
      return ua !== ub ? ua - ub : a.id - b.id;
    })
    .map((p) => ({ id: p.id, label: p.label, uses: usage.get(p.id) ?? 0 }));
  const [handle] = await safeLoad(() => getMyHandle(), null as string | null, "ideas");

  const setupError = ideasError;

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
        <SetupNotice message={setupError} />
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
        <IdeaList
          ideas={ideas}
          drafts={drafts}
          emptyFilter={filter}
          hasAny={counts.total > 0}
          photos={photos}
          handle={handle}
        />
      )}
    </div>
  );
}
