import { getLendingFacts, getDistinctLoanTypes } from "@/lib/queries";
import AddLendingFactForm from "@/components/settings/AddLendingFactForm";
import DeleteLendingFactButton from "@/components/settings/DeleteLendingFactButton";
import InstagramConnection from "@/components/settings/InstagramConnection";

/**
 * Messages the Instagram OAuth routes hand back in the query string. They
 * arrive as text rather than codes because they come from four different
 * failure points -- Instagram's error, our state check, the token exchange,
 * and the duplicate-account check -- and a code table would have to be kept
 * in step with all four.
 */
function ConnectionBanner({
  ok,
  warn,
  info,
  error,
}: {
  ok?: string;
  warn?: string;
  info?: string;
  error?: string;
}) {
  const message = ok ?? warn ?? info ?? error;
  if (!message) return null;

  const tone = ok
    ? "border-accent/40 bg-accent/10 text-accent"
    : error
      ? "border-warn/40 bg-warn/10 text-warn"
      : warn
        ? "border-warn/40 bg-warn/10 text-warn"
        : "border-border bg-panel-2 text-muted";

  return (
    <p className={`rounded-lg border px-3 py-2 text-sm ${tone}`} role="status">
      {message}
    </p>
  );
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    ig_ok?: string;
    ig_warn?: string;
    ig_info?: string;
    ig_error?: string;
  }>;
}) {
  const [facts, loanTypeSuggestions, params] = await Promise.all([
    getLendingFacts(),
    getDistinctLoanTypes(),
    searchParams,
  ]);

  // Facts already come back grouped by loan type (see getLendingFacts'
  // ORDER BY), so just bucket them here for rendering as sections
  // instead of one flat list.
  const grouped = new Map<string, typeof facts>();
  for (const f of facts) {
    const key = f.loan_type?.trim() || "General / unspecified";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(f);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-4 md:p-8">
      <div>
        <h1 className="text-lg font-semibold text-text">Sources & Facts</h1>
        <p className="mt-1 text-sm text-muted">
          This is the one place in the app for verified lending facts and where they came from.
          Hook Lab, Script Writer, and the Inspiration breakdown tool all read this list before
          writing anything -- they treat what&rsquo;s here as ground truth, and are told to write
          around any specific number or rule that isn&rsquo;t covered here (including for a whole
          loan type with nothing entered yet) rather than guess at it.
        </p>
      </div>

      <ConnectionBanner
        ok={params.ig_ok}
        warn={params.ig_warn}
        info={params.ig_info}
        error={params.ig_error}
      />

      <InstagramConnection />

      <AddLendingFactForm loanTypeSuggestions={loanTypeSuggestions} />

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
          <div className="space-y-6">
            {Array.from(grouped.entries()).map(([loanType, items]) => (
              <section key={loanType}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
                  {loanType} ({items.length})
                </h3>
                <ul className="space-y-3">
                  {items.map((f) => (
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
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
