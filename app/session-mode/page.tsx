import { getQueuedScripts } from "@/lib/queries";
import Teleprompter, { type QueuedScriptItem } from "@/components/session-mode/Teleprompter";
import SetupNotice from "@/components/SetupNotice";
import { safeLoad } from "@/lib/db-errors";

function extractScriptBody(raw: string | null): string {
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.script === "string") return parsed.script;
  } catch {
    // body wasn't JSON (older/manual script row) -- use it as-is
  }
  return raw;
}

export default async function SessionModePage() {
  // Guarded like every other page. Unwrapped, a database that is a
  // migration behind took the whole teleprompter down with a stack
  // trace, which is a bad thing to meet with a camera already running.
  const [scripts, setupError] = await safeLoad(
    () => getQueuedScripts(),
    [] as Awaited<ReturnType<typeof getQueuedScripts>>,
    "session-mode",
  );
  if (setupError) {
    return (
      <div className="mx-auto max-w-2xl p-4 md:p-8">
        <SetupNotice message={setupError} />
      </div>
    );
  }
  const items: QueuedScriptItem[] = scripts.map((s) => ({
    id: s.id,
    hook: s.hook ?? "",
    body: extractScriptBody(s.body),
  }));

  return <Teleprompter scripts={items} />;
}
