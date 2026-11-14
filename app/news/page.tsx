import NewsReaction from "@/components/news/NewsReaction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function NewsPage() {
  return (
    <div className="mx-auto max-w-2xl p-4 md:p-8">
      <NewsReaction />
    </div>
  );
}
