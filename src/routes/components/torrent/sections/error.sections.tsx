import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/locale/i18n.utils";

export function TorrentError({ error, onRetry }: { error: string; onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="mt-1 flex items-center gap-1">
      <span className="text-destructive windows95-font text-xs">{error}</span>
      <Button size="icon" className="ml-auto size-4" title={t("torrent.retry")} onClick={onRetry}>
        <RefreshCw className="size-3" />
      </Button>
    </div>
  );
}
