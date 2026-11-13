import { getBook, getChapters } from "@/lib/books/queries";

/**
 * The whole book as one markdown file.
 *
 * Markdown rather than a Word document on purpose: it opens in anything,
 * it survives being pasted into a publishing tool, and it is the same
 * text that is stored, so what he downloads is exactly what he read on
 * the page. A .docx would need a converter in the middle, and a
 * converter in the middle is a thing that silently changes your book.
 */
export async function GET(request: Request) {
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id < 1) {
    return new Response("Which book?", { status: 400 });
  }

  const book = await getBook(id);
  if (!book) return new Response("That book is not there.", { status: 404 });
  const chapters = await getChapters(id);

  // The title page, then one `#` per chapter. The subtitle is a plain
  // italic line rather than an `##`, because a `##` directly above a
  // chapter's `#` reads as a section containing it, which is backwards.
  const parts = [`# ${book.title}`];
  if (book.subtitle) parts.push(`*${book.subtitle}*`);
  for (const c of chapters) {
    const body = (c.body ?? "").trim();
    // A chapter with no prose still appears, as its summary, so the file
    // is a true picture of where the book is rather than quietly short.
    parts.push(
      body ||
        `# ${c.title}\n\n*Not written yet.*${c.summary ? `\n\n> ${c.summary}` : ""}`,
    );
  }

  const slug =
    book.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "book";

  return new Response(parts.join("\n\n"), {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="${slug}.md"`,
    },
  });
}
