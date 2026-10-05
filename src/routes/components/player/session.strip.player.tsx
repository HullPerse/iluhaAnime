import { cn } from "cn";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import type { SessionStripProps } from "@/types/player";
import type { LagStatus } from "@/types/session";

const LAG_CLASS: Record<LagStatus, string> = {
  fair: "text-highlight",
  good: "text-success",
  poor: "text-destructive",
};

/**
 * Compact session overlay for the player window: role, room, peer count, lag
 * status, and the host-lost banner. Offset and resync controls live in the
 * lobby panel so this stays a thin always-visible indicator.
 */
export function SessionStrip({
  role,
  sample,
  status,
  hostLost,
  onResumeAlone,
}: SessionStripProps) {
  const { t } = useI18n();

  const lag = sample?.lag ?? null;
  const peers = status?.peers.length ?? 0;
  const roomCode = (status?.sessionId ?? "").slice(0, 8).toUpperCase();

  return (
    <div className="windows95-border windows95-text bg-surface/95 absolute left-2 top-2 z-30 max-w-[min(22rem,90%)] text-xs">
      <div className="flex items-center gap-2 px-1.5 py-1">
        <span className="text-text font-bold">
          {role === "host" ? t("lobby.room.host") : t("lobby.room.guest")}
        </span>
        {roomCode.length > 0 && (
          <span className="text-hint">{t("lobby.room.code", { code: roomCode })}</span>
        )}
        <span className="text-hint">
          {t("lobby.player.peers", { count: peers })}
        </span>
        {lag && (
          <span className={cn("flex items-center gap-1 font-bold", LAG_CLASS[lag])}>
            <span aria-hidden="true">●</span>
            {t(`lobby.player.lag.${lag}`)}
          </span>
        )}
        <span className="flex-1" />
        {hostLost && (
          <span className="text-destructive font-bold">
            {t("lobby.player.hostLost")}
          </span>
        )}
      </div>

      {hostLost && (
        <div className="border-t-muted flex items-center gap-1 border-t px-1.5 py-1">
          <span className="text-hint flex-1">
            {t("lobby.player.hostLost.hint")}
          </span>
          <Button onClick={onResumeAlone}>{t("lobby.player.resumeAlone")}</Button>
        </div>
      )}
    </div>
  );
}
