"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

/** The repair SQL, with a button, because retyping it is how typos happen. */
export default function CopyBlock({ sql }: { sql: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <p className="text-xs font-medium text-text">Run this in Supabase</p>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(sql);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              setFailed(true);
              setTimeout(() => setFailed(false), 4000);
            }
          }}
          className="ml-auto inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent"
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {failed && (
        <p className="text-[11px] text-warn">
          Your browser blocked the copy. Select the text below by hand.
        </p>
      )}
      <pre className="overflow-x-auto rounded-lg border border-border bg-panel-2 p-3 text-[11px] leading-relaxed text-text">
        {sql}
      </pre>
    </div>
  );
}
