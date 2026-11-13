import { notFound } from "next/navigation";
import { getBook, getChapters } from "@/lib/books/queries";
import { safeLoad } from "@/lib/db-errors";
import SetupNotice from "@/components/SetupNotice";
import BookWorkspace from "@/components/books/BookWorkspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function BookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const bookId = Number(id);
  if (!Number.isInteger(bookId) || bookId < 1) notFound();

  const [book, setupError] = await safeLoad(() => getBook(bookId), null, "books");
  if (setupError) {
    return (
      <div className="mx-auto max-w-2xl p-4 md:p-8">
        <SetupNotice message={setupError} />
      </div>
    );
  }
  if (!book) notFound();

  const [chapters] = await safeLoad(
    () => getChapters(bookId),
    [] as Awaited<ReturnType<typeof getChapters>>,
    "book_chapters",
  );

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-8">
      <BookWorkspace book={book} chapters={chapters} />
    </div>
  );
}
