import ScriptWriterForm from "@/components/scripts/ScriptWriterForm";

export default async function ScriptWriterPage({
  searchParams,
}: {
  searchParams: Promise<{ modelPostId?: string }>;
}) {
  const params = await searchParams;
  const modelPostId = params.modelPostId ? Number(params.modelPostId) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-lg font-semibold text-text">Script Writer</h1>
        <p className="mt-1 text-sm text-muted">
          Give it a topic, optionally model the structure on a post that already worked.
        </p>
      </div>
      <ScriptWriterForm initialModelPostId={Number.isFinite(modelPostId) ? modelPostId : null} />
    </div>
  );
}
