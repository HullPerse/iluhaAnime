import { useQuery } from "@tanstack/react-query";

import { invokeTyped } from "@/lib/utils/invoke.utils";
import { useSettingsStore } from "@/store/settings.store";
import type { UserImage } from "@/types";

export function useWallpaperImage() {
  const selectedId = useSettingsStore((state) => state.selectedDitherId);
  const query = useQuery({
    queryKey: ["dither-wallpaper", selectedId],
    queryFn: async () => {
      const image = await invokeTyped<UserImage>("get_dither_image", { id: selectedId ?? "" });
      return image.dataUrl;
    },
    enabled: selectedId !== null,
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });
  return query;
}
