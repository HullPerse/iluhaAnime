import { Hash, Infinity as InfinityIcon, MoreHorizontal, Trash2 } from "lucide-react";
import { useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm.component";
import { Button } from "@/components/ui/button.component";
import { DropdownMenuContent } from "@/components/ui/dropdown/content.dropdown";
import { DropdownMenuItem } from "@/components/ui/dropdown/item.dropdown";
import { DropdownMenu } from "@/components/ui/dropdown/menu.dropdown";
import { DropdownMenuRadioGroup } from "@/components/ui/dropdown/radioGroup.dropdown";
import { DropdownMenuRadioItem } from "@/components/ui/dropdown/radioItem.dropdown";
import { DropdownMenuSeparator } from "@/components/ui/dropdown/separator.dropdown";
import { DropdownMenuTrigger } from "@/components/ui/dropdown/trigger.dropdown";
import { useCardsMutations } from "@/hooks/cards/mutations.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { setCardsBinderPage } from "@/store/cards.store";
import type { ConfirmStep } from "@/types/ui/collection";

export default function AlbumMenu({
  view,
  infinite,
  onInfinite,
}: {
  view: "grid" | "binder";
  infinite: boolean;
  onInfinite: (infinite: boolean) => void;
}) {
  const { t } = useI18n();
  const { resetCollection } = useCardsMutations();
  const [confirmStep, setConfirmStep] = useState<ConfirmStep>(0);
  const closeConfirm = () => setConfirmStep(0);
  const applyReset = () => {
    resetCollection.mutate(undefined, { onSuccess: () => setCardsBinderPage(0) });
    setConfirmStep(0);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              size="icon"
              className="h-6 w-6 shrink-0"
              title={t("collection.album.menu")}
              aria-label={t("collection.album.menu")}
            >
              <MoreHorizontal className="size-3.5" />
            </Button>
          }
        />
        <DropdownMenuContent align="end" side="bottom" sideOffset={4} className="min-w-52">
          {view === "grid" && (
            <DropdownMenuRadioGroup
              value={infinite ? "scroll" : "pagination"}
              onValueChange={(value) => onInfinite(value === "scroll")}
            >
              <DropdownMenuRadioItem value="pagination" title={t("collection.grid.paged")}>
                <Hash className="size-4" />
                {t("collection.grid.paged")}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="scroll" title={t("collection.grid.infinite")}>
                <InfinityIcon className="size-4" />
                {t("collection.grid.infinite")}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={resetCollection.isPending}
            onClick={() => setConfirmStep(1)}
          >
            <Trash2 className="size-4" />
            {t("collection.album.menu.clear")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirmStep === 1}
        title={t("collection.album.menu.clear.title")}
        message={t("collection.album.menu.clear.message")}
        confirmLabel={t("collection.album.menu.clear.next")}
        onConfirm={() => setConfirmStep(2)}
        onCancel={closeConfirm}
        onClose={closeConfirm}
      />
      <ConfirmDialog
        open={confirmStep === 2}
        title={t("collection.album.menu.clear.final.title")}
        message={t("collection.album.menu.clear.final.message")}
        confirmLabel={t("collection.album.menu.clear.confirm")}
        variant="destructive"
        onConfirm={applyReset}
        onCancel={closeConfirm}
        onClose={closeConfirm}
      />
    </>
  );
}
