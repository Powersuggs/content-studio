import { listNewsletters } from "@/lib/newsletter/queries";
import { listIdeas } from "@/lib/ideas/queries";
import NewsletterWriter from "@/components/newsletter/NewsletterWriter";
import NewsletterList, {
  type NewsletterItem,
} from "@/components/newsletter/NewsletterList";
import SetupNotice from "@/components/SetupNotice";
import { safeLoad } from "@/lib/db-errors";

export const dynamic = "force-dynamic";

export default async function NewsletterPage() {
  const [newsletters, newslettersError] = await safeLoad(
    () => listNewsletters(),
    [] as Awaited<ReturnType<typeof listNewsletters>>,
    "newsletter",
  );

  // Ideas that have not been turned into an email yet. The point of
  // offering these is the gap: an idea already made into a reel but not
  // an email is the cheapest email there is.
  const [ideas] = await safeLoad(
    () => listIdeas("all"),
    [] as Awaited<ReturnType<typeof listIdeas>>,
    "newsletter",
  );
  const ideaOptions = ideas
    .filter((i) => !i.made.includes("email"))
    .slice(0, 8)
    .map((i) => ({ id: i.id, title: i.title }));

  // Dates cross to the client as strings: a Date would be serialized and
  // revived inconsistently, and the list only ever formats it.
  const items: NewsletterItem[] = newsletters.map((n) => ({
    id: n.id,
    subject: n.subject,
    subjectAlts: n.subjectAlts,
    body: n.body,
    status: n.status,
    topic: n.topic,
    createdAt: n.createdAt.toISOString(),
  }));

  const counts = {
    draft: items.filter((i) => i.status === "draft").length,
    ready: items.filter((i) => i.status === "ready").length,
    sent: items.filter((i) => i.status === "sent").length,
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-lg font-semibold text-text">Newsletter</h1>
        <p className="mt-1 text-sm text-muted">
          The same idea that becomes a reel is usually also an email, and the
          email is the one that reaches people who are not being served an
          algorithm that day. Write it here, edit it, then copy it into
          whatever you send from.
        </p>
      </div>

      {newslettersError && <SetupNotice message={newslettersError} />}

      {!newslettersError && (
        <>
          <NewsletterWriter ideas={ideaOptions} />

          {items.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 text-xs text-faint">
              <span>
                {items.length} email{items.length === 1 ? "" : "s"}
              </span>
              {counts.draft > 0 && <span>{counts.draft} draft</span>}
              {counts.ready > 0 && (
                <span className="text-accent">{counts.ready} ready to send</span>
              )}
              {counts.sent > 0 && <span>{counts.sent} sent</span>}
            </div>
          )}

          <NewsletterList items={items} />
        </>
      )}
    </div>
  );
}
