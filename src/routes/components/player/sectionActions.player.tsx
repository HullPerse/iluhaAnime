import { openPath } from "@tauri-apps/plugin-opener";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { useI18n } from "@/hooks/i18n.hook";

export default function SectionActions({
  onRefresh,
  saveDir,
}: {
  onRefresh: () => void;
  saveDir: string;
}) {
  const { t } = useI18n();
  return (
    <>
      <Button size="icon" className="size-5" title={t("player.files.refresh")} onClick={onRefresh}>
        <RefreshCw className="size-3" />
      </Button>
      <Button
        size="icon"
        className="size-5"
        title={t("player.files.open.folder")}
        onClick={() => openPath(saveDir)}
      >
        <ImageComponent src="/images/w2k_folder_closed.ico" alt="" className="size-4" />
      </Button>
    </>
  );
}
