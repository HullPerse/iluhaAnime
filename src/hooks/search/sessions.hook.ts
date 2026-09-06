import { useQuery } from "@tanstack/react-query";

import { withFallback } from "@/lib/utils/attempt.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { useSettingsStore } from "@/store/settings.store";

export function useSearchSessions() {
  const rutrackerProxy = useSettingsStore((s) => s.searchProxyUrls["rutracker"] ?? "");
  const nekobtProxy = useSettingsStore((s) => s.searchProxyUrls["nekobt"] ?? "");
  const eraiProxy = useSettingsStore((s) => s.searchProxyUrls["erai-raws"] ?? "");
  const { data: sessions } = useQuery({
    queryKey: ["search_sessions", rutrackerProxy, nekobtProxy, eraiProxy],
    queryFn: async () => {
      const [rutracker, nekobt, erai] = await Promise.all([
        withFallback(
          invokeTyped<boolean>("check_rutracker_session", {
            proxyUrl: rutrackerProxy || undefined,
            proxy_url: rutrackerProxy || undefined,
          }),
          false
        ),
        withFallback(
          invokeTyped<boolean>("check_nekobt_session", {
            proxyUrl: nekobtProxy || undefined,
            proxy_url: nekobtProxy || undefined,
          }),
          false
        ),
        withFallback(
          invokeTyped<boolean>("check_erai_session", {
            proxyUrl: eraiProxy || undefined,
            proxy_url: eraiProxy || undefined,
          }),
          false
        ),
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
