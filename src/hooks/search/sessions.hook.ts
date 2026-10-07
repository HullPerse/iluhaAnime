import { torrentApi } from "@/api/torrent.api";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { queryKeys } from "@/lib/query/keys.utils";
import { useCell } from "@/lib/state/signal.hook";
import { withFallback } from "@/lib/utils/attempt.utils";
import { settingsAtoms } from "@/store/settings.store";

const SESSION_CHECK_TIMEOUT_MS = 8000;

function withSessionTimeout(promise: Promise<boolean>): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), SESSION_CHECK_TIMEOUT_MS);
  });
  return Promise.race([promise.catch(() => false), timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

export function useSearchSessions() {
  const rutrackerProxy = useCell(settingsAtoms.searchProxyUrls)["rutracker"] ?? "";
  const nekobtProxy = useCell(settingsAtoms.searchProxyUrls)["nekobt"] ?? "";
  const eraiProxy = useCell(settingsAtoms.searchProxyUrls)["erai-raws"] ?? "";
  const { data: sessions } = useAppQuery("slow", {
    queryKey: queryKeys.searchSessions(rutrackerProxy, nekobtProxy, eraiProxy),
    queryFn: async () => {
      const [rutracker, nekobt, erai] = await Promise.all([
        withFallback(withSessionTimeout(torrentApi.checkRutrackerSession()), false),
        withFallback(withSessionTimeout(torrentApi.checkNekobtSession()), false),
        withFallback(withSessionTimeout(torrentApi.checkEraiSession()), false),
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
