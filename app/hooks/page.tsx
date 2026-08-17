import HookLabForm from "@/components/hooks/HookLabForm";

export default function HookLabPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-lg font-semibold text-text">Hook Lab</h1>
        <p className="mt-1 text-sm text-muted">
          Eight opening lines, one per archetype, for a single topic.
        </p>
      </div>
      <HookLabForm />
    </div>
  );
}
