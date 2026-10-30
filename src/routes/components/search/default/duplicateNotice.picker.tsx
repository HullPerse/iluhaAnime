import { useI18n } from "@/hooks/i18n.hook";
import type { TorrentInfo } from "@/types/torrent/torrent";
import type { ReactElement } from "react";

export function DuplicateNotice({
  duplicate,
}: {
  duplicate: TorrentInfo | null;
}): ReactElement | null {
  const { t } = useI18n();
  if (!duplicate) return null;
  return (
    <div role="alert" className="windows95-text text-destructive w-full px-1 text-xs">
      {t("picker.duplicate", { name: duplicate.name })}
    </div>
  );
}
