import { RefreshCw } from "lucide-react";

import { SmallLoader } from "@/components/shared/loader/small.loader";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";

export function FriendPreviewEmpty({
  hasSelection,
  profileError,
  friendMissing,
  refreshing,
  onRefresh,
}: {
  hasSelection: boolean;
  profileError: string | null;
  friendMissing: boolean;
  refreshing: boolean;
  onRefresh: (force: boolean) => void;
}) {
  const { t } = useI18n();

  if (!hasSelection) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6">
        <span className="windows95-text text-hint text-center text-xs">
          {t("anilist.friends.help")}
        </span>
      </div>
    );
  }
  if (profileError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6">
        <span className="windows95-text text-destructive text-xs">{profileError}</span>
        <Button
          size="icon"
          className="size-5"
          title={t("anilist.friends.refresh")}
          disabled={friendMissing || refreshing}
          onClick={() => onRefresh(true)}
        >
          <RefreshCw className="size-3" />
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6">
      <SmallLoader size={5} />
    </div>
  );
}
