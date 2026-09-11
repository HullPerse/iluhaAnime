import { useQuery } from "@tanstack/react-query";

import { assetUrl } from "@/lib/utils/image.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { useSettingsStore } from "@/store/settings.store";
import type { UserImage, UserImageFile } from "@/types/image.userimage";

export function useWallpaperImage() {
  const selectedId = useSettingsStore((state) => state.selectedDitherId);
  const query = useQuery({
    queryKey: ["dither-wallpaper", selectedId],
    queryFn: async () => {
      const image = await invokeTyped<UserImageFile>("get_dither_image", { id: selectedId ?? "" });
      const result: UserImage = {
        id: image.id,
        name: image.name,
        mimeType: image.mimeType,
        url: assetUrl(image.path),
        originalUrl: image.originalPath === null ? null : assetUrl(image.originalPath),
        ditherOptions: image.ditherOptions ?? null,
        createdAt: image.createdAt,
      };
      return result;
    },
    enabled: selectedId !== null,
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });
  return query;
}
