import { listPhotos, countPhotos } from "@/lib/photos/queries";
import PhotoBank, { type PhotoView } from "@/components/photos/PhotoBank";
import SetupNotice from "@/components/SetupNotice";
import { safeLoad } from "@/lib/db-errors";

export const dynamic = "force-dynamic";

export default async function PhotosPage() {
  const [photos, photosError] = await safeLoad(
    () => listPhotos(),
    [] as Awaited<ReturnType<typeof listPhotos>>,
    "photos",
  );
  const [totals] = await safeLoad(() => countPhotos(), { count: 0, bytes: 0 }, "photos");

  const views: PhotoView[] = photos.map((p) => ({
    id: p.id,
    kind: p.kind,
    label: p.label,
    tags: p.tags,
    width: p.width,
    height: p.height,
    byteSize: p.byteSize,
    source: p.source,
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-lg font-semibold text-text">Photos</h1>
        <p className="mt-1 text-sm text-muted">
          The images your slides are built from. Real photographs beat generated ones in a
          business where people are deciding whether to trust you, and they cost nothing.
          Keep a few good shots of yourself here, some of the team, and some with no people
          in them at all.
        </p>
      </div>

      {photosError && <SetupNotice message={photosError} />}

      {!photosError && <PhotoBank photos={views} totalBytes={totals.bytes} />}
    </div>
  );
}
