import { useI18n } from "@/hooks/i18n.hook";
import type { NewsItem } from "@/types/news/news";

import CardNews from "@/routes/components/news/card.news";

/** Renders the feed as a magazine grid, or the empty state. */
export default function FeedNews({
  items,
  onOpen,
}: {
  items: readonly NewsItem[];
  onOpen: (item: NewsItem) => void;
}) {
  const { t } = useI18n();
  if (items.length === 0) {
    return <p className="windows95-text text-hint p-4">{t("news.empty")}</p>;
  }
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] items-start gap-2">
      {items.map((item) => (
        <CardNews key={item.id} item={item} onOpen={onOpen} />
      ))}
    </div>
  );
}
