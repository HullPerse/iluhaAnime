import { systemApi } from "@/api/system.api";
import { DITHER_PLACEHOLDER_ID } from "@/config/utils/dither.config";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { queryKeys } from "@/lib/query/keys.utils";
import { useCell } from "@/lib/state/signal.hook";
import { reportBackgroundError } from "@/lib/utils/attempt.utils";
import { assetUrl } from "@/lib/utils/image.utils";
import { settingsAtoms } from "@/store/settings.store";
import type { UserImage } from "@/types/userimage";

export function useWallpaperImage() {
  const selectedId = useCell(settingsAtoms.selectedDitherId);
  const effectiveId = selectedId === DITHER_PLACEHOLDER_ID ? null : selectedId;
  const query = useAppQuery("slow", {
    queryKey: queryKeys.wallpaper(effectiveId),
    queryFn: async (): Promise<UserImage | null> => {
      const image = await systemApi.getDitherImage(effectiveId ?? "");
      if (!image) {
        reportBackgroundError("wallpaper.load", new Error("missing dither image"));
        return null;
      }
      const result: UserImage = {
        id: image.id,
        name: image.name,
        mimeType: image.mimeType,
        url: assetUrl(image.path, image.version),
        originalUrl: image.originalPath === null ? null : assetUrl(image.originalPath),
        version: image.version,
        createdAt: image.createdAt,
      };
      return result;
    },
    enabled: effectiveId !== null,
    retry: false,
    placeholderData: (previous) => previous,
  });
  return query;
}
