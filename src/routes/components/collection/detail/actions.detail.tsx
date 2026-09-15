import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { Play } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import { attempt } from "@/lib/utils/attempt.utils";
import { showError } from "@/lib/utils/notification.utils";
import type { CollectionItem } from "@/types/collection";

export function DetailActionsCollection({ item }: { item: CollectionItem }) {
  const { t } = useI18n();
  const openLocal = async () => {
    if (!item.localPath) return;
    const [, error] = await attempt(openPath(item.localPath));
    if (error !== null) showError(t("common.error"), String(error));
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
    </div>
  );
}
