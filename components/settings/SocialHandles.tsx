"use client";

import { useState, useTransition } from "react";
import { Check, ExternalLink, Link2 } from "lucide-react";
import { saveSocialHandleAction } from "@/app/settings/actions";
import {
  PLATFORMS,
  normalizeHandle,
  type Platform,
} from "@/lib/social/platforms";
import type { SocialHandle } from "@/lib/social/handles";

/**
 * Your handles on every platform, and a button straight to each one.
 *
 * Instagram is the only platform this app reads numbers from today, and the
 * rows say so. Promising analytics that are months of approvals away would
 * make the other rows feel broken rather than useful, when in fact the jump
 * button is the whole point of them for now.
 */
export default function SocialHandles({
  initial,
}: {
  initial: SocialHandle[];
}) {
  const byPlatform = new Map(initial.map((h) => [h.platform, h]));

  return (
    <section className="space-y-3 rounded-xl border border-border bg-panel p-4">
      <div>
        <h2 className="text-sm font-semibold text-text">Your other platforms</h2>
        <p className="mt-1 text-xs text-muted">
          Add a handle and you get a button straight to that profile. Instagram
          is the only one this app reads numbers from so far. The rest are links
          for now, and each will start reporting numbers as its connection is
          built.
        </p>
      </div>

      <div className="divide-y divide-border">
        {PLATFORMS.map((platform) => (
          <HandleRow
            key={platform.id}
            platform={platform}
            existing={byPlatform.get(platform.id)}
          />
        ))}
      </div>
    </section>
  );
}

function HandleRow({
  platform,
  existing,
}: {
  platform: Platform;
  existing?: SocialHandle;
}) {
  const [value, setValue] = useState(existing?.handle ?? "");
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Linked straight off what is typed, so the button points somewhere sensible
  // before a save as well as after.
  const normalized = normalizeHandle(value);
  const liveUrl = normalized ? platform.profileUrl(normalized) : null;
  const dirty = normalized !== (existing?.handle ?? "");

  function save() {
    if (!dirty) return;
    startTransition(async () => {
      await saveSocialHandleAction(platform.id, value);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 py-3">
      <div className="w-24 shrink-0">
        <span className="text-sm text-text">{platform.label}</span>
        {!platform.analytics && (
          <span className="block text-[10px] text-faint">link only</span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 rounded-lg border border-border bg-panel-2 px-2 focus-within:border-accent">
          <span className="text-sm text-faint">@</span>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
            }}
            onBlur={save}
            placeholder={platform.placeholder}
            aria-label={`${platform.label} handle`}
            className="w-full bg-transparent py-2 text-sm text-text outline-none placeholder:text-faint"
          />
        </div>
        {platform.hint && (
          <p className="mt-1 text-[10px] text-faint">{platform.hint}</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {saved ? (
          <span className="flex items-center gap-1 px-2 text-xs text-accent">
            <Check size={14} strokeWidth={2} />
            Saved
          </span>
        ) : dirty ? (
          <button
            type="button"
            onClick={save}
            disabled={isPending}
            className="rounded-lg bg-accent px-3 py-2 text-xs font-medium text-bg disabled:opacity-60"
          >
            {isPending ? "Saving" : "Save"}
          </button>
        ) : null}

        {liveUrl ? (
          <a
            href={liveUrl}
            target="_blank"
            rel="noreferrer"
            title={`Open ${platform.label}`}
            className="flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs text-muted transition-colors hover:border-accent hover:text-accent"
          >
            <ExternalLink size={14} strokeWidth={1.75} />
            Open
          </a>
        ) : (
          <span className="flex items-center gap-1 px-3 py-2 text-xs text-faint">
            <Link2 size={14} strokeWidth={1.75} />
            No handle
          </span>
        )}
      </div>
    </div>
  );
}
