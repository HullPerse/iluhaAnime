import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import { useI18n } from "@/hooks/i18n.hook";
import { sourceDisplayText, sourceKindKey } from "@/lib/session/source.utils";
import { formatBytes } from "@/lib/utils/bytes.utils";
import { formatClock } from "@/lib/utils/time.utils";
import type { TranslationKey } from "@/types/i18n";
import type { PlanItemRowProps } from "@/types/lobby";
import type { MatchLevel } from "@/types/session";

function matchStatusKey(level: MatchLevel | undefined): TranslationKey {
  if (level === "exact") return "lobby.playlist.matched";
  if (level === "compatible") return "lobby.playlist.compatible";
  if (level === "risky") return "lobby.playlist.risky";
  if (level === undefined) return "lobby.playlist.missing";
  return "lobby.playlist.mismatch";
}

const DELTA_FIELD_KEYS: Record<string, TranslationKey> = {
  bitrate: "lobby.playlist.delta.bitrate",
  codec: "lobby.playlist.delta.codec",
  duration: "lobby.playlist.delta.duration",
  fps: "lobby.playlist.delta.fps",
  resolution: "lobby.playlist.delta.resolution",
  size: "lobby.playlist.delta.size",
};

/**
 * One media plan entry: the identity summary, the source chips, and the
 * role-specific controls (host: sources and torrent; guest: local file match,
 * folder search, and the host download).
 */
export default function PlanItemRow({
  item,
  index,
  isHost,
  canStart,
  isHeld,
  missingNames,
  report,
  sourceDraft,
  fileDraft,
  verifying = false,
  verifyFailed = null,
  onSourceDraftChange,
  onFileDraftChange,
  onAddSource,
  onRemoveSource,
  onCreateTorrent,
  onRemoveItem,
  onUseFile,
  onPickFolder,
  onDownloadFromHost,
  onRedownload,
  onStartItem,
}: PlanItemRowProps) {
  const { t } = useI18n();

  return (
    <li className="windows95-border flex flex-col gap-1 p-1">
      <div className="flex items-center gap-2">
        <span className="windows95-text text-hint text-xs">{index + 1}</span>
        <span className="windows95-text text-text min-w-0 flex-1 truncate text-xs font-bold">
          {item.title}
        </span>
        {!isHost && (
          <span className="windows95-text text-hint text-xs">
            {t(matchStatusKey(report?.level))}
          </span>
        )}
        <span className="windows95-text text-hint text-xs">
          {formatClock(item.identity.duration)} ·{" "}
          {formatBytes(item.identity.size)}
        </span>
        {canStart && (
          <Button
            disabled={isHeld}
            title={isHeld ? t("lobby.playlist.heldHint") : undefined}
            onClick={onStartItem}
          >
            {t("lobby.playlist.playItem")}
          </Button>
        )}
        {isHost && (
          <Button
            aria-label={t("lobby.playlist.removeItem")}
            size="icon"
            title={t("lobby.playlist.removeItem")}
            onClick={onRemoveItem}
          >
            ×
          </Button>
        )}
      </div>

      {isHeld && missingNames.length > 0 && (
        <p className="windows95-text text-highlight text-xs">
          {t("lobby.playlist.heldFor", { names: missingNames.join(", ") })}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1">
        {item.sources.map((source) => {
          const text = sourceDisplayText(source);
          return (
            <span
              className="windows95-border bg-field flex items-center gap-1 px-1"
              key={source.sourceId}
            >
              <span className="windows95-text text-text text-xs">
                {t(sourceKindKey(source.kind))}
                {text ? `: ${text}` : ""}
              </span>
              {isHost && (
                <button
                  aria-label={t("lobby.playlist.removeSource")}
                  className="windows95-text text-destructive text-xs"
                  title={t("lobby.playlist.removeSource")}
                  type="button"
                  onClick={() => onRemoveSource(source.sourceId)}
                >
                  ×
                </button>
              )}
            </span>
          );
        })}
        {isHost && (
          <>
            <Input
              className="w-40"
              placeholder={t("lobby.playlist.addSource.placeholder")}
              value={sourceDraft}
              onChange={(event) => onSourceDraftChange(event.target.value)}
            />
            <Button onClick={onAddSource}>{t("lobby.playlist.addSource")}</Button>
            <Button onClick={onCreateTorrent}>
              {t("lobby.playlist.createTorrent")}
            </Button>
          </>
        )}
      </div>

      {!isHost && report && report.deltas.length > 0 && (
        <table className="windows95-text text-hint text-xs">
          <tbody>
            {report.deltas.map((delta) => {
              const key = DELTA_FIELD_KEYS[delta.field];
              return (
                <tr key={delta.field}>
                  <td className="pr-1">{key ? t(key) : delta.field}</td>
                  <td className="pr-1 text-text">{delta.host}</td>
                  <td className="text-text">{delta.local}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {!isHost && (
        <div className="flex flex-wrap items-center gap-1">
          <Input
            className="w-48"
            placeholder={t("lobby.playlist.useMyFile.placeholder")}
            value={fileDraft}
            onChange={(event) => onFileDraftChange(event.target.value)}
          />
          <Button onClick={onUseFile}>{t("lobby.playlist.useMyFile")}</Button>
          <Button onClick={onPickFolder}>{t("lobby.playlist.pickFolder")}</Button>
          {item.sources.some((source) => source.kind === "hostSeeded") && (
            <Button onClick={onDownloadFromHost}>
              {t("lobby.playlist.downloadFromHost")}
            </Button>
          )}
          {verifying && (
            <span className="windows95-text text-hint text-xs">
              {t("lobby.playlist.verifying")}
            </span>
          )}
          {verifyFailed !== null && (
            <>
              <span className="windows95-text text-destructive text-xs">
                {t("lobby.playlist.download.mismatch")}
              </span>
              <Button onClick={onRedownload}>
                {t("lobby.playlist.download.redownload")}
              </Button>
            </>
          )}
        </div>
      )}
    </li>
  );
}
