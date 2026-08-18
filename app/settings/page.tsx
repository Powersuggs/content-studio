import { getLendingFacts } from "@/lib/queries";
import AddLendingFactForm from "@/components/settings/AddLendingFactForm";
import DeleteLendingFactButton from "@/components/settings/DeleteLendingFactButton";

export default async function SettingsPage() {
  const facts = await getLendingFacts();

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-4 md:p-8">
      <div>
        <h1 className="text-lg font-semibold text-text">Sources & Facts</h1>
        <p className="mt-1 text-sm text-muted">
          This is the one place in the app for verified lending facts and where they came from.
          Hook Lab, Script Writer, and the Inspiration breakdown tool all read this list before
          writing anything -- they treat what&rsquo;s here as ground truth, and are told to write
          around any specific number or rule that isn&rsquo;t covered here rather than guess at it.
        </p>
      </div>

      <AddLendingFactForm />

      <div>
        <h2 className="mb-3 text-sm font-semibold text-text">
          Verified facts ({facts.length})
        </h2>
        {facts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-sm text-faint">
            No verified facts yet. Add your first one above -- start with the seller-concession
            rule you already double-checked.
          </div>
        ) : (
          <ul className="space-y-3">
            {facts.map((f) => (
              <li key={f.id} className="rounded-xl border border-border bg-panel p-4">
                <p className="text-sm text-text">{f.fact}</p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] text-muted">
                    {f.source_name || f.source_url ? (
                      <>
                        Source:{" "}
                        {f.source_url ? (
                          <a
                            href={f.source_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-accent hover:underline"
                          >
                            {f.source_name || f.source_url}
                          </a>
                        ) : (
                          f.source_name
                        )}
                      </>
                    ) : (
                      "No source noted"
                    )}
                  </p>
                  <DeleteLendingFactButton id={f.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
