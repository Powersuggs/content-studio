import { getQueuedScripts } from "@/lib/queries";
import Teleprompter, { type QueuedScriptItem } from "@/components/session-mode/Teleprompter";

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
  const scripts = await getQueuedScripts();
  const items: QueuedScriptItem[] = scripts.map((s) => ({
    id: s.id,
    hook: s.hook ?? "",
    body: extractScriptBody(s.body),
  }));

  return <Teleprompter scripts={items} />;
}
