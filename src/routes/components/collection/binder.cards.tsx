import { useI18n } from "@/hooks/i18n.hook";
import type { CollectionItem } from "@/types/api/cards";

import BinderPage from "@/routes/components/collection/binderPage.cards";

export default function BinderCards({
  items,
  page,
  pageCount,
  columns,
  pageSize,
  onOpen,
}: {
  items: readonly CollectionItem[];
  page: number;
  pageCount: number;
  columns: number;
  pageSize: number;
  onOpen?: (card: CollectionItem) => void;
}) {
  const { t } = useI18n();

  return (
    <div data-testid="binder" className="cards-binder">
      <div className="cards-binder-rings" aria-hidden>
        {Array.from({ length: 6 }, (_, index) => (
          <span key={index} />
        ))}
      </div>
      <div className="cards-binder-sheet">
        <div className="cards-binder-head">
          <span>{t("collection.binder")}</span>
          <span className="tabular-nums">
            {page + 1} / {Math.max(1, pageCount)}
          </span>
        </div>
        <BinderPage
          items={items}
          pageNumber={page}
          columns={columns}
          pageSize={pageSize}
          onOpen={onOpen}
        />
      </div>
    </div>
  );
}
