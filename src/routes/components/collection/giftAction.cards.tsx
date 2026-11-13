import { Gift } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import type { CollectionItem } from "@/types/api/cards";

export default function GiftAction({
  item,
  onOpen,
}: {
  item: CollectionItem;
  onOpen: () => void;
}) {
  const { t } = useI18n();
  const canGift = item.copies > 1;

  return (
    <Button
      size="icon"
      className="size-5"
      disabled={!canGift}
      aria-label={t("collection.gift.create")}
      title={canGift ? t("collection.gift.create") : t("collection.gift.need.duplicate")}
      onClick={onOpen}
    >
      <Gift className="size-3" />
    </Button>
  );
}
