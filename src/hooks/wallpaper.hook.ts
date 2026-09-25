import { systemApi } from "@/api/system.api";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { queryKeys } from "@/lib/query/keys.utils";
import { assetUrl } from "@/lib/utils/image.utils";
import { useSettingsStore } from "@/store/settings.store";
import type { UserImage } from "@/types/userimage";

export function useWallpaperImage() {
  const selectedId = useSettingsStore((state) => state.selectedDitherId);
  const query = useAppQuery("slow", {
    queryKey: queryKeys.wallpaper(selectedId),
    queryFn: async () => {
      const image = await systemApi.getDitherImage(selectedId ?? "");
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
    enabled: selectedId !== null,
    retry: false,
    placeholderData: (previous) => previous,
  });
  return query;
}
