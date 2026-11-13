import Link from "next/link";
import { listBooks } from "@/lib/books/queries";
import { safeLoad } from "@/lib/db-errors";
import SetupNotice from "@/components/SetupNotice";
import NewBook from "@/components/books/NewBook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The books. Usually one.
 *
 * A list page for a thing there is one of looks like overkill, and it is
 * the right shape anyway: a second book is how a first one gets
 * abandoned, so seeing both is the point.
 */
export default async function BooksPage() {
  const [books, setupError] = await safeLoad(
    () => listBooks(),
    [] as Awaited<ReturnType<typeof listBooks>>,
    "books",
  );
  if (setupError) {
    return (
      <div className="mx-auto max-w-2xl p-4 md:p-8">
        <SetupNotice message={setupError} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-8">
      <div>
        <h1 className="text-xl font-semibold text-text">Books</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Chapters get drafted from your own words: the takes you have talked
          through, your posts, and the facts you have verified. Nothing is
          written from thin air.
        </p>
      </div>

      <NewBook />

      {books.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-faint">
          No book yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {books.map((b) => (
            <li key={b.id} className="rounded-xl border border-border bg-panel">
              <Link href={`/books/${b.id}`} className="block p-3">
                <span className="text-sm font-medium text-text">{b.title}</span>
                {b.subtitle && (
                  <span className="block text-xs text-muted">{b.subtitle}</span>
                )}
                <span className="mt-1 block text-xs text-faint">
                  {b.chapters ?? 0} chapters, {b.drafted ?? 0} written,{" "}
                  {(b.words ?? 0).toLocaleString()} words
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
