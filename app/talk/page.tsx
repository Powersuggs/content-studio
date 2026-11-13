import TalkItOut from "@/components/talk/TalkItOut";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Speaking a whole idea, and getting the pieces back.
 *
 * Nothing is read from the database to draw this page: the recording and
 * everything that follows it happen through routes. So there is no setup
 * notice here, and the page works on a fresh install.
 */
export default function TalkPage() {
  return (
    <div className="mx-auto max-w-2xl p-4 md:p-8">
      <TalkItOut />
    </div>
  );
}
