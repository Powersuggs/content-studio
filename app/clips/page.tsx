import ClipFinder from "@/components/clips/ClipFinder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Nothing is read from the database to draw this page: the video never
 * leaves his phone except as sound, and the clips are not stored. So it
 * works on a fresh install with no setup notice.
 */
export default function ClipsPage() {
  return (
    <div className="mx-auto max-w-2xl p-4 md:p-8">
      <ClipFinder />
    </div>
  );
}
