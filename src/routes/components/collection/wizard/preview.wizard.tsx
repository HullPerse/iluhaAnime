import { useI18n } from "@/lib/locale/i18n.utils";
import type { CollectionItem, CollectionStatusDef } from "@/types/collection";

import { CollectionCard } from "../card.collection";

export function WizardPreview({
  title,
  coverUrl,
  previewItem,
  statuses,
}: {
  title: string;
  coverUrl: string;
  previewItem: CollectionItem;
  statuses: CollectionStatusDef[];
}) {
  const { t } = useI18n();
  return (
    <div className="flex w-full shrink-0 flex-col gap-2 md:w-[200px]">
      <div className="windows95-border bg-primary sticky top-0 p-2">
        <div className="mb-1 text-xs font-bold">{t("collection.wizard.preview")}</div>
        <div className="flex justify-center">
          <CollectionCard item={previewItem} statuses={statuses} />
        </div>
        {!title.trim() && (
          <p className="text-destructive mt-1 text-xs">{t("collection.wizard.title")} *</p>
        )}
        {!coverUrl && (
          <p className="text-destructive text-xs">{t("collection.wizard.cover.required")}</p>
        )}
      </div>
    </div>
  );
}
