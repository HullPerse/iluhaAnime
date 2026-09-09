import { useQuery } from "@tanstack/react-query";

import { assetUrl } from "@/lib/utils/image.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { useSettingsStore } from "@/store/settings.store";
import type { UserImageFile } from "@/types";

export function useWallpaperImage() {
  const selectedId = useSettingsStore((state) => state.selectedDitherId);
  const query = useQuery({
    queryKey: ["dither-wallpaper", selectedId],
    queryFn: async () => {
      const image = await invokeTyped<UserImageFile>("get_dither_image", { id: selectedId ?? "" });
      return assetUrl(image.path);
    },
    enabled: selectedId !== null,
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });
  return query;
}
