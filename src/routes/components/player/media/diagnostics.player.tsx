import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { useCell } from "@hullperse/hp_utils/react";
import { ignore } from "@/lib/core/shared/promise.utils";
import {
  formatFps,
  formatCount,
  formatCache,
  formatPreparationTime,
  getPlayerDiagnostics,
} from "@/lib/player/diagnostics.utils";
import { playbackAtoms, streamSession } from "@/store/player.store";

function RuntimeDiagnostics() {
  const { t } = useI18n();
  const diagnostics = useQuery({
    queryKey: ["player", "diagnostics"],
    queryFn: getPlayerDiagnostics,
    refetchInterval: 2000,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const report = diagnostics.data;

  return (
    <>
      {report && (
        <>
          {[
            { label: t("player.media.diagnostics.decoder"), value: report.decoder },
            { label: t("player.media.diagnostics.vo"), value: report.videoOutput },
            { label: t("player.media.diagnostics.gpu"), value: report.gpuContext },
            { label: t("player.media.diagnostics.ao"), value: report.audioOutput },
          ].map((row) => (
            <div key={row.label} className="mb-0.5 flex justify-between gap-2">
              <span className="text-muted text-xs">{row.label}:</span>
              <span className="font-bold tabular-nums">{row.value ?? "-"}</span>
            </div>
          ))}
          <div className="windows95-text mt-2 mb-1 text-xs font-bold">
            {t("player.media.diagnostics.preparation")}
          </div>
          {[
            {
              label: t("player.media.diagnostics.windowReady"),
              value: report.startup.windowCreatedAtMs,
            },
            {
              label: t("player.media.diagnostics.nativeReady"),
              value: report.startup.nativeReadyAtMs,
            },
            {
              label: t("player.media.diagnostics.frontendReady"),
              value: report.startup.frontendReadyAtMs,
            },
          ].map((row) => (
            <div key={row.label} className="mb-0.5 flex justify-between gap-2">
              <span className="text-muted text-xs">{row.label}:</span>
              <span className="font-bold tabular-nums">{formatPreparationTime(row.value)}</span>
            </div>
          ))}
        </>
      )}
      {diagnostics.isError && (
        <div role="status" className="mt-1 text-xs">
          {t("player.media.diagnostics.error")}
          <Button loading={diagnostics.isFetching} onClick={() => ignore(diagnostics.refetch())}>
            {t("player.media.diagnostics.retry")}
          </Button>
        </div>
      )}
    </>
  );
}

function DiagnosticsOverlay() {
  const { t } = useI18n();

  const hasFile = useCell(playbackAtoms.hasFile);
  const fpsRender = useCell(playbackAtoms.fpsRender);
  const fpsVideo = useCell(playbackAtoms.fpsVideo);
  const dropCount = useCell(playbackAtoms.dropCount);
  const cacheDuration = useCell(playbackAtoms.cacheDuration);
  const streaming = useCell(streamSession) !== null;
  const hwdecCurrent = useCell(playbackAtoms.hwdecCurrent);
  const videoWidth = useCell(playbackAtoms.videoWidth);
  const videoHeight = useCell(playbackAtoms.videoHeight);

  const rows: Array<{ label: string; value: string }> = [
    { label: t("player.media.diagnostics.fps.render"), value: formatFps(fpsRender) },
    { label: t("player.media.diagnostics.fps.video"), value: formatFps(fpsVideo) },
    { label: t("player.media.diagnostics.drops"), value: formatCount(dropCount) },
    ...(streaming
      ? [{ label: t("player.media.diagnostics.cache"), value: formatCache(cacheDuration) }]
      : []),
    { label: t("player.media.diagnostics.hwdec"), value: hwdecCurrent ?? "-" },
    {
      label: t("player.media.diagnostics.resolution"),
      value:
        videoWidth !== undefined && videoHeight !== undefined
          ? `${videoWidth}x${videoHeight}`
          : "-",
    },
  ];
  const waiting =
    hasFile &&
    fpsRender === undefined &&
    fpsVideo === undefined &&
    dropCount === undefined &&
    cacheDuration === undefined &&
    hwdecCurrent === undefined &&
    videoWidth === undefined;

  return (
    <div
      data-player-diagnostics
      className="windows95-border windows95-font bg-primary/95 absolute bottom-4 left-4 z-20 max-h-[65vh] max-w-[90vw] min-w-52 overflow-auto p-2 text-left text-sm"
    >
      <div className="windows95-text mb-1 text-xs font-bold">
        {t("player.media.diagnostics.title")}
      </div>
      {!hasFile ? (
        <div className="text-xs">{t("player.media.diagnostics.empty")}</div>
      ) : (
        rows.map((row) => (
          <div key={row.label} className="mb-0.5 flex justify-between gap-2">
            <span className="text-muted text-xs">{row.label}:</span>{" "}
            <span className="font-bold tabular-nums">{row.value}</span>
          </div>
        ))
      )}
      {hasFile && waiting && <div className="text-xs">{t("player.media.diagnostics.empty")}</div>}
      <RuntimeDiagnostics />
    </div>
  );
}

export default DiagnosticsOverlay;
