import { torrentApi } from "@/api/torrent.api";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { queryKeys } from "@/lib/query/keys.utils";
import { withFallback } from "@/lib/utils/attempt.utils";
import { useSettingsStore } from "@/store/settings.store";

export function useSearchSessions() {
  const rutrackerProxy = useSettingsStore((s) => s.searchProxyUrls["rutracker"] ?? "");
  const nekobtProxy = useSettingsStore((s) => s.searchProxyUrls["nekobt"] ?? "");
  const eraiProxy = useSettingsStore((s) => s.searchProxyUrls["erai-raws"] ?? "");
  const { data: sessions } = useAppQuery("slow", {
    queryKey: queryKeys.searchSessions(rutrackerProxy, nekobtProxy, eraiProxy),
    queryFn: async () => {
      const [rutracker, nekobt, erai] = await Promise.all([
        withFallback(torrentApi.checkRutrackerSession(), false),
        withFallback(torrentApi.checkNekobtSession(), false),
        withFallback(torrentApi.checkEraiSession(), false),
      ]);
      return { rutracker, nekobt, erai };
    },
  });
  return {
    rutrackerAuth: sessions?.rutracker ?? false,
    nekobtAuth: sessions?.nekobt ?? false,
    eraiAuth: sessions?.erai ?? false,
  };
}
