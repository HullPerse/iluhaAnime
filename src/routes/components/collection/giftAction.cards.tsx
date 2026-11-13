import { Gift } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";

export default function GiftAction({ onOpen }: { onOpen: () => void }) {
  const { t } = useI18n();

  return (
    <Button
      size="icon"
      className="size-5"
      aria-label={t("collection.gift.create")}
      title={t("collection.gift.create")}
      onClick={onOpen}
    >
      <Gift className="size-3" />
    </Button>
  );
}
