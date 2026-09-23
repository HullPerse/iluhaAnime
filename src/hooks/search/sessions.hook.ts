import { useQuery } from "@tanstack/react-query";

import { torrentApi } from "@/api/torrent.api";
import { withFallback } from "@/lib/utils/attempt.utils";
import { useSettingsStore } from "@/store/settings.store";

export function useSearchSessions() {
  const rutrackerProxy = useSettingsStore((s) => s.searchProxyUrls["rutracker"] ?? "");
  const nekobtProxy = useSettingsStore((s) => s.searchProxyUrls["nekobt"] ?? "");
  const eraiProxy = useSettingsStore((s) => s.searchProxyUrls["erai-raws"] ?? "");
  const { data: sessions } = useQuery({
    queryKey: ["search_sessions", rutrackerProxy, nekobtProxy, eraiProxy],
    queryFn: async () => {
      const [rutracker, nekobt, erai] = await Promise.all([
        withFallback(torrentApi.checkRutrackerSession(), false),
        withFallback(torrentApi.checkNekobtSession(), false),
        withFallback(torrentApi.checkEraiSession(), false),
      ]);
      return { rutracker, nekobt, erai };
    },
    staleTime: 5 * 60 * 1000,
  });
  return {
    rutrackerAuth: sessions?.rutracker ?? false,
    nekobtAuth: sessions?.nekobt ?? false,
    eraiAuth: sessions?.erai ?? false,
  };
}
