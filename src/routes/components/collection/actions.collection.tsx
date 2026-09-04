import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Play, RefreshCw, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/i18n";
import type { CollectionItem } from "@/types/collection";

export function DetailActionsCollection({
  item,
  onClose,
  updateItem,
  refreshMetadata,
}: {
  item: CollectionItem;
  onClose: () => void;
  updateItem: (id: string, patch: Partial<CollectionItem>) => void;
  refreshMetadata: (item: CollectionItem) => Promise<void>;
}) {
  const { t } = useI18n();
  const openLocal = async () => {
    if (!item.localPath) return;
    try {
      await invoke("open_path", { path: item.localPath });
    } catch {
      try {
        await openUrl(item.localPath);
      } catch {}
    }
  };

  const rewatch = () => {
    updateItem(item.id, {
      rewatchCount: item.rewatchCount + 1,
      status: "rewatching",
      lastWatchedAt: Date.now(),
    });
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
      <Button variant="outline" onClick={rewatch}>
        <RotateCcw className="size-3" /> {t("collection.details.rewatch")}
      </Button>
      <Button
        variant="outline"
        disabled={item.externalIds.anilist == null && item.externalIds.tmdb == null}
        onClick={() => refreshMetadata(item)}
      >
        <RefreshCw className="size-3" /> {t("collection.details.refresh.metadata")}
      </Button>
      <Button variant="outline" onClick={onClose}>
        {t("collection.details.close")}
      </Button>
    </div>
  );
}
