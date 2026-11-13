import { buildBinderPage } from "@/lib/cards/binder.utils";
import type { CollectionItem } from "@/types/api/cards";

import BinderPocket from "@/routes/components/collection/pocket.cards";

export default function BinderPage({
  items,
  pageNumber,
  columns,
  pageSize,
  onOpen,
}: {
  items: readonly CollectionItem[];
  pageNumber: number;
  columns: number;
  pageSize: number;
  onOpen?: (card: CollectionItem) => void;
}) {
  const page = buildBinderPage(items, 0, pageSize);

  return (
    <div
      data-testid="binder-page"
      className="cards-binder-page cards-binder-grid"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {page.slots.map((card, index) => (
        <BinderPocket
          key={`${pageNumber}:${index}:${card?.kind ?? "empty"}:${card?.entityId ?? 0}:${card?.rarity ?? ""}:${card?.variant ?? ""}`}
          card={card}
          index={index}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}
