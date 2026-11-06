import Link from "next/link";
import type { PipelineSnapshot } from "@/lib/ideas/queries";

/**
 * What the idea pipeline is actually doing for you.
 *
 * The two counts are shown side by side rather than as a percentage.
 * Nothing connects an output in here to the post it became, because
 * plenty gets written straight into Instagram, so a conversion rate
 * would be a number this app cannot honestly compute.
 *
 * The sentence underneath is the point. Two bare figures invite the
 * reader to invent their own meaning, usually a worse one.
 */
export default function PipelineStrip({ snap }: { snap: PipelineSnapshot }) {
  const nothingYet =
    snap.made === 0 && snap.untouchedIdeas === 0 && snap.formatsWaiting === 0;

  if (nothingYet && snap.posted === 0) return null;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-text">Pipeline</h2>
        <Link href="/ideas" className="text-xs text-accent hover:underline">
          Open Ideas
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Made here" value={snap.made} sub="last 30 days" />
        <Tile label="Posted" value={snap.posted} sub="last 30 days" />
        <Tile
          label="Ideas untouched"
          value={snap.untouchedIdeas}
          sub="nothing made yet"
          warn={snap.untouchedIdeas > 0}
        />
        <Tile
          label="Formats waiting"
          value={snap.formatsWaiting}
          sub="still on the table"
        />
      </div>

      <p className="mt-2 text-xs text-muted">{read(snap)}</p>
    </section>
  );
}

/** Says what the numbers mean, in the case that actually applies. */
function read(snap: PipelineSnapshot): string {
  if (snap.made === 0 && snap.posted > 0) {
    return `You posted ${snap.posted} time${snap.posted === 1 ? "" : "s"} in the last 30 days and planned none of it here. Capturing those as ideas first is what makes the rest of this app useful.`;
  }
  if (snap.made === 0) {
    return "Nothing made from an idea yet. Capture one and tick off a format when you turn it into something.";
  }
  if (snap.untouchedIdeas > 0) {
    return `${snap.made} made in the last 30 days. ${snap.untouchedIdeas} idea${snap.untouchedIdeas === 1 ? " is" : "s are"} sitting untouched, which is the cheapest place to find your next post.`;
  }
  if (snap.formatsWaiting > 0) {
    return `${snap.made} made in the last 30 days, and every idea you have has produced something. ${snap.formatsWaiting} format${snap.formatsWaiting === 1 ? "" : "s"} could still come out of what you have already thought of.`;
  }
  return `${snap.made} made in the last 30 days. Everything you have captured has been used up, so the pipeline needs refilling.`;
}

function Tile({
  label,
  value,
  sub,
  warn,
}: {
  label: string;
  value: number;
  sub: string;
  warn?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-panel p-4">
      <p className="text-xs text-faint">{label}</p>
      <p
        className={`mt-1 text-xl font-semibold ${warn ? "text-warn" : "text-text"}`}
      >
        {value}
      </p>
      <p className="mt-0.5 text-[10px] text-faint">{sub}</p>
    </div>
  );
}
