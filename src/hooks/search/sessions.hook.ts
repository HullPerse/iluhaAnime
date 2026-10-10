import { torrentApi } from "@/api/torrent.api";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { queryKeys } from "@/lib/query/keys.utils";
import { useCell } from "@/lib/state/signal.hook";
import { unwrapOr, withTimeout } from "@/lib/utils/result.utils";
import { settingsAtoms } from "@/store/settings.store";

const SESSION_CHECK_TIMEOUT_MS = 8000;

function withSessionTimeout(promise: Promise<boolean>): Promise<boolean> {
  return withTimeout(promise, SESSION_CHECK_TIMEOUT_MS).then((result) => unwrapOr(result, false));
}

export function useSearchSessions() {
  const rutrackerProxy = useCell(settingsAtoms.searchProxyUrls)["rutracker"] ?? "";
  const nekobtProxy = useCell(settingsAtoms.searchProxyUrls)["nekobt"] ?? "";
  const eraiProxy = useCell(settingsAtoms.searchProxyUrls)["erai-raws"] ?? "";
  const { data: sessions } = useAppQuery("slow", {
    queryKey: queryKeys.searchSessions(rutrackerProxy, nekobtProxy, eraiProxy),
    queryFn: async () => {
      const [rutracker, nekobt, erai] = await Promise.all([
        withSessionTimeout(torrentApi.checkRutrackerSession()),
        withSessionTimeout(torrentApi.checkNekobtSession()),
        withSessionTimeout(torrentApi.checkEraiSession()),
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
