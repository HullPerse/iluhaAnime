import { Loader2, RefreshCw, WifiOff } from "lucide-react";
import { useCallback } from "react";

import { systemApi } from "@/api/system.api";
import { useI18n } from "@/hooks/i18n.hook";
import { useOnlineStatus } from "@/hooks/network.hook";
import { networkAtoms, probeNetwork } from "@/lib/core/networkHealth.utils";
import { ignore } from "@/lib/core/promise.utils";
import { useCell } from "@hullperse/hp_utils/react";
import { settingsAtoms } from "@/store/settings.store";

/**
 * The shell stays usable without internet: the library, torrents, the local
 * player and settings are all local. The banner says so once, instead of
 * leaving the disabled tabs as the only clue.
 *
 * A reachable-looking adapter with dead traffic (a dropped VPN, a resolver that
 * stopped answering) is reported too, because `navigator.onLine` alone cannot
 * see it. The retry probe tests the hosts the app actually needs, so the banner
 * can clear itself without reloading the app.
 */
export default function OfflineBanner() {
  const { t } = useI18n();
  const online = useOnlineStatus();
  const reachable = useCell(networkAtoms.reachable);
  const checking = useCell(networkAtoms.checking);

  const check = useCallback(() => {
    ignore(
      probeNetwork(() =>
        systemApi.probeNetwork(
          settingsAtoms.anilistProxyUrl.get(),
          settingsAtoms.animelibProxyUrl.get()
        )
      )
    );
  }, []);

  if (online && reachable) return null;

  return (
    <div
      data-testid="offline-banner"
      className="windows95-border bg-secondary text-text mx-1 mb-1 flex shrink-0 items-center gap-2 px-2 py-1 text-xs"
    >
      <WifiOff className="size-3.5 shrink-0" aria-hidden />
      <span className="font-bold">
        {online ? t("network.degraded.title") : t("network.offline.title")}
      </span>
      <span className="text-hint min-w-0 flex-1 truncate">
        {online
          ? t("network.degraded.hint")
          : `${t("network.offline.local")} ${t("network.offline.blocked")}`}
      </span>
      {online && (
        <button
          type="button"
          className="windows95-border bg-primary text-text flex shrink-0 items-center gap-1 px-1.5 py-0.5 hover:cursor-pointer hover:brightness-110 disabled:opacity-50"
          disabled={checking}
          onClick={check}
        >
          {checking ? (
            <Loader2 className="size-3 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="size-3" aria-hidden />
          )}
          {t("network.retry")}
        </button>
      )}
    </div>
  );
}
