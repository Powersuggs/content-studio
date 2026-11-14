import HookLabForm from "@/components/hooks/HookLabForm";
import Patterns from "@/components/hooks/Patterns";
import { listPatterns } from "@/lib/hooks/patterns";
import { safeLoad } from "@/lib/db-errors";
import SetupNotice from "@/components/SetupNotice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function HookLabPage() {
  const [patterns, setupError] = await safeLoad(
    () => listPatterns(),
    [] as Awaited<ReturnType<typeof listPatterns>>,
    "hook_patterns",
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-lg font-semibold text-text">Hook Lab</h1>
        <p className="mt-1 text-sm text-muted">
          Eight opening lines, one per archetype, for a single topic.
        </p>
      </div>
      <HookLabForm />
      {setupError ? <SetupNotice message={setupError} /> : <Patterns patterns={patterns} />}
    </div>
  );
}
