import { useState } from "react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { anilistApi } from "@/api/anilist.api";
import { attempt } from "@/lib/core/attempt.utils";
import { removeListEntry } from "@/lib/anilist/listEntry.utils";
import { queryKeys } from "@/lib/core/keys.utils";
import { useQueryClient } from "@tanstack/react-query";
import type { AnilistRouteData } from "@/types/anilist/anilist";

export function DeleteListEntryButton({
  animeId,
  disabled,
  onSaved,
  onClose,
  onError,
}: {
  animeId: number;
  disabled: boolean;
  onSaved?: () => void;
  onClose?: () => void;
  onError: (message: string) => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState<boolean>(false);

  const handleDelete = async () => {
    const userId = queryClient.getQueryData<AnilistRouteData>(queryKeys.anilistData())?.user?.id;
    if (!userId) {
      onError(t("anilist.controls.delete.error"));
      return;
    }
    setDeleting(true);
    const previous = queryClient.getQueryData<AnilistRouteData>(queryKeys.anilistData());
    removeListEntry(queryClient, animeId);
    const [, error] = await attempt(anilistApi.deleteEntry(animeId, userId));
    if (error) {
      queryClient.setQueryData(queryKeys.anilistData(), previous);
      onError(t("anilist.controls.delete.error"));
      setDeleting(false);
      return;
    }
    onSaved?.();
    onClose?.();
  };

  return (
    <Button variant="error" onClick={handleDelete} disabled={disabled || deleting}>
      {t("anilist.controls.delete")}
    </Button>
  );
}
