import { cn } from "cn";
import { useState } from "react";

import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import { SESSION_OFFSET_LIMIT_MS } from "@/config/lobby/common.config";
import { useI18n } from "@/hooks/i18n.hook";
import type { LobbyPanelProps } from "@/types/player";
import type { LagStatus } from "@/types/session";

import RosterLobby from "../lobby/roster.lobby";

const LAG_CLASS: Record<LagStatus, string> = {
  fair: "text-highlight",
  good: "text-success",
  poor: "text-destructive",
};

export default function LobbyPanel({
  role,
  sample,
  status,
  onOffset,
  onResync,
}: LobbyPanelProps) {
  const { t } = useI18n();
  const [secondsDraft, setSecondsDraft] = useState("");
  const [millisDraft, setMillisDraft] = useState("");

  const lag = sample?.lag ?? null;
  const offsetMs = sample?.offsetMs ?? 0;
  const link = sample?.haveSnapshot
    ? t("lobby.player.link", {
        drift: Math.round(sample.driftMs),
        rtt: Math.round(sample.rttMs),
      })
    : t("lobby.player.waiting");

  const readyCount = status?.ready.peers.filter((peer) => peer.ready).length ?? 0;
  const total = status?.peers.length ?? 0;

  const applyOffset = () => {
    const seconds = Number.parseFloat(secondsDraft) || 0;
    const millis = Number.parseFloat(millisDraft) || 0;
    setSecondsDraft("");
    setMillisDraft("");
    onOffset(clampOffset(Math.round(seconds * 1000 + millis)));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-1">
      <section className="ui-panel">
        <div className="ui-titlebar">
          <span className="text-title-text font-bold">
            {t("lobby.player.settings")}
          </span>
        </div>
        <div className="flex flex-col gap-1 p-2">
          <div className="flex items-center gap-2">
            <span className="windows95-text text-hint text-xs">{link}</span>
            {lag && (
              <span
                className={cn(
                  "windows95-text text-xs font-bold",
                  LAG_CLASS[lag]
                )}
              >
                {t(`lobby.player.lag.${lag}`)}
              </span>
            )}
          </div>

          {role === "host" ? (
            <Button
              className="self-start"
              onClick={onResync}
              title={t("lobby.forceResync.hint")}
            >
              {t("lobby.forceResync")}
            </Button>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-1">
                <span className="windows95-text text-hint text-xs">
                  {t("lobby.player.offset")}
                </span>
                <Input
                  aria-label={t("lobby.player.offset.seconds")}
                  className="w-12"
                  inputMode="decimal"
                  onChange={(event) => setSecondsDraft(event.currentTarget.value)}
                  placeholder="0"
                  value={secondsDraft}
                />
                <span className="windows95-text text-hint text-xs">s</span>
                <Input
                  aria-label={t("lobby.player.offset.millis")}
                  className="w-14"
                  inputMode="decimal"
                  onChange={(event) => setMillisDraft(event.currentTarget.value)}
                  placeholder="0"
                  value={millisDraft}
                />
                <span className="windows95-text text-hint text-xs">ms</span>
                <Button onClick={applyOffset}>
                  {t("lobby.player.offset.apply")}
                </Button>
              </div>
              <span className="windows95-text text-hint text-xs">
                {t("lobby.player.offset.current", {
                  value: formatOffset(offsetMs),
                })}
              </span>
            </>
          )}
        </div>
      </section>

      {status ? <RosterLobby className="w-full" peers={status.peers} /> : null}

      {status && total > 0 ? (
        <section className="ui-panel px-2 py-1">
          <span className="windows95-text text-hint text-xs">
            {t("lobby.playlist.readyGate", { ready: readyCount, total })}
          </span>
        </section>
      ) : null}
    </div>
  );
}

function clampOffset(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(
    -SESSION_OFFSET_LIMIT_MS,
    Math.min(SESSION_OFFSET_LIMIT_MS, value)
  );
}

function formatOffset(value: number): string {
  const seconds = value / 1000;
  const sign = seconds > 0 ? "+" : "";
  return `${sign}${seconds.toFixed(3)}s`;
}
