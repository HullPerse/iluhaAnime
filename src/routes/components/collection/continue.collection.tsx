import { useI18n } from "@/lib/locale/i18n.utils";
import type { CollectionItem } from "@/types/collection";

const CONTINUE_MAX = 5;

export default function ContinueCollection({
  items,
  onOpen,
}: {
  items: CollectionItem[];
  onOpen: (item: CollectionItem) => void;
}) {
  const { t } = useI18n();
  if (items.length === 0) return null;
  return (
    <section
      aria-label={t("collection.continue.title")}
      className="ui-panel flex w-full flex-col gap-1 p-1"
    >
      <span className="windows95-text text-xs font-bold">{t("collection.continue.title")}</span>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onOpen(item)}
          title={item.title}
          className="windows95-text hover:bg-surface flex min-w-0 items-center gap-1 text-left text-xs"
        >
          <span className="min-w-0 flex-1 truncate">{item.title}</span>
          <span className="text-hint shrink-0">
            {item.progressTotal
              ? `${item.progressValue}/${item.progressTotal}`
              : `${item.progressValue}`}
          </span>
        </button>
      ))}
    </section>
  );
}

export { CONTINUE_MAX };
