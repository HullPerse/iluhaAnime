import { torrentApi } from "@/api/torrent.api";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { queryKeys } from "@/lib/core/hotkeys/keys.utils";
import { useCell } from "@hullperse/hp_utils/react";
import { unwrapOr, withTimeout } from "@hullperse/hp_utils/result";
import { settingsAtoms } from "@/store/settings.store";
import type { SearchSessionsData, Source } from "@/types/search/search";

const SESSION_CHECK_TIMEOUT_MS = 8000;

function withSessionTimeout(promise: Promise<boolean>): Promise<boolean> {
  return withTimeout(promise, SESSION_CHECK_TIMEOUT_MS).then((result) => unwrapOr(result, false));
}

const NO_SESSIONS: SearchSessionsData = { rutracker: false, nekobt: false, erai: false };

async function checkSession(source: Source): Promise<SearchSessionsData> {
  switch (source) {
    case "rutracker": {
      return { ...NO_SESSIONS, rutracker: await withSessionTimeout(torrentApi.checkRutrackerSession()) };
    }
    case "nekobt": {
      return { ...NO_SESSIONS, nekobt: await withSessionTimeout(torrentApi.checkNekobtSession()) };
    }
    case "erai-raws": {
      return { ...NO_SESSIONS, erai: await withSessionTimeout(torrentApi.checkEraiSession()) };
    }
    default: {
      return NO_SESSIONS;
    }
  }
}

export function useSearchSessions(source: Source) {
  const rutrackerProxy = useCell(settingsAtoms.searchProxyUrls)["rutracker"] ?? "";
  const nekobtProxy = useCell(settingsAtoms.searchProxyUrls)["nekobt"] ?? "";
  const eraiProxy = useCell(settingsAtoms.searchProxyUrls)["erai-raws"] ?? "";
  const authRequired = source === "rutracker" || source === "nekobt" || source === "erai-raws";
  const { data: sessions } = useAppQuery("slow", {
    queryKey: queryKeys.searchSessions(source, rutrackerProxy, nekobtProxy, eraiProxy),
    enabled: authRequired,
    queryFn: () => checkSession(source),
  });
  return {
    rutrackerAuth: sessions?.rutracker ?? false,
    nekobtAuth: sessions?.nekobt ?? false,
    eraiAuth: sessions?.erai ?? false,
  };
}
