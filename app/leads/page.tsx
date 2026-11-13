import { getLeads, countLeadsByStatus, findCollectedHandles } from "@/lib/leads/queries";
import { safeLoad } from "@/lib/db-errors";
import SetupNotice from "@/components/SetupNotice";
import LeadList from "@/components/leads/LeadList";

/**
 * People worth reaching out to.
 *
 * Every row is someone he already chose to look at: saved to a board,
 * reverse-engineered, or torn down. The page does not go looking outside
 * the app, and says so, because a list that quietly implies it found
 * strangers would be both wrong and the wrong promise.
 */
export default async function LeadsPage() {
  const [leads, setupError] = await safeLoad(
    () => getLeads(),
    [] as Awaited<ReturnType<typeof getLeads>>,
    "leads",
  );
  if (setupError) {
    return (
      <div className="mx-auto max-w-2xl p-4 md:p-8">
        <SetupNotice message={setupError} />
      </div>
    );
  }

  const [counts] = await safeLoad(() => countLeadsByStatus(), {}, "leads");
  const [collected] = await safeLoad(
    () => findCollectedHandles(),
    [] as Awaited<ReturnType<typeof findCollectedHandles>>,
    "leads",
  );
  // How many are sitting in the app that are not on the list yet. Shown
  // on the button so pressing it is never a shot in the dark.
  const known = new Set(leads.map((l) => l.handle));
  const waiting = collected.filter((c) => !known.has(c.handle)).length;

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-8">
      <LeadList leads={leads} counts={counts} waiting={waiting} />
    </div>
  );
}
