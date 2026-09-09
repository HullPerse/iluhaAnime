import { openUrl } from "@tauri-apps/plugin-opener";
import { Play, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import type { CollectionItem } from "@/types/collection";

export function DetailActionsCollection({
  item,
  refreshMetadata,
}: {
  item: CollectionItem;
  refreshMetadata: (item: CollectionItem) => Promise<void>;
}) {
  const { t } = useI18n();
  const openLocal = async () => {
    if (!item.localPath) return;
    try {
      await invokeTyped("open_path", { path: item.localPath });
    } catch {
      try {
        await openUrl(item.localPath);
      } catch (error) {
        console.warn("open_path and openUrl both failed", error);
      }
    }
  };

  return (
    <div className="mt-2 flex flex-wrap gap-1">
      <Button onClick={openLocal} disabled={!item.localPath}>
        <Play className="size-3" /> {t("collection.details.open.local")}
      </Button>
      {item.externalIds.anilist && (
        <Button onClick={() => openUrl(`https://anilist.co/anime/${item.externalIds.anilist}`)}>
          {t("collection.details.anilist")}
        </Button>
      )}
      <Button
        variant="outline"
        disabled={item.externalIds.anilist == null && item.externalIds.tmdb == null}
        onClick={() => refreshMetadata(item)}
      >
        <RefreshCw className="size-3" /> {t("collection.details.refresh.metadata")}
      </Button>
    </div>
  );
}
