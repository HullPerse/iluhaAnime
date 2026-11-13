import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useState } from "react";

import { Button } from "@/components/ui/button.component";
import { useCardsMutations } from "@/hooks/cards/mutations.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { buildCardGiftLink } from "@/lib/cards/gift.utils";
import type { CollectionItem } from "@/types/api/cards";

export default function GiftAction({ item }: { item: CollectionItem }) {
  const { t } = useI18n();
  const gift = useCardsMutations().createGift;
  const [link, setLink] = useState<string>("");
  const [copied, setCopied] = useState<boolean>(false);
  const [copyError, setCopyError] = useState<boolean>(false);

  if (item.copies <= 1 && link === "") return null;

  const create = () => {
    setCopied(false);
    setCopyError(false);
    gift.mutate(
      {
        kind: item.kind,
        entityId: item.entityId,
        rarity: item.rarity,
        variant: item.variant,
      },
      {
        onSuccess: (result) => {
          setLink(
            buildCardGiftLink({
              giftId: result.id,
              kind: result.card.kind,
              entityId: result.card.entityId,
              rarity: result.card.rarity,
              variant: result.card.variant,
            })
          );
        },
      }
    );
  };

  const copy = async () => {
    try {
      await writeText(link);
      setCopied(true);
      setCopyError(false);
    } catch {
      setCopied(false);
      setCopyError(true);
    }
  };

  return (
    <div className="windows95-border bg-field flex flex-col gap-1 p-2">
      {link === "" ? (
        <Button
          className="h-6 self-start px-2 text-xs"
          loading={gift.isPending}
          onClick={create}
        >
          {t("collection.gift.create")}
        </Button>
      ) : (
        <>
          <p className="windows95-text text-hint m-0">{t("collection.gift.created")}</p>
          <div className="flex items-center gap-1">
            <input
              className="windows95-border bg-primary text-text windows95-text min-w-0 flex-1 px-1 py-0.5"
              value={link}
              readOnly
              aria-label={t("collection.gift.link")}
              onFocus={(event) => event.currentTarget.select()}
            />
            <Button className="h-6 px-2 text-xs" onClick={copy}>
              {t("collection.gift.copy")}
            </Button>
          </div>
          {copied && (
            <span className="windows95-text text-success" role="status">
              {t("collection.gift.copied")}
            </span>
          )}
          {copyError && (
            <span className="windows95-text text-destructive" role="alert">
              {t("collection.gift.copy.error")}
            </span>
          )}
        </>
      )}
      {gift.isError && (
        <span className="windows95-text text-destructive" role="alert">
          {t("collection.gift.create.error")}
        </span>
      )}
    </div>
  );
}
