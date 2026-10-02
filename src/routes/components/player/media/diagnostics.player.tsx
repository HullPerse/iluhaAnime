import { useI18n } from "@/lib/locale/i18n.utils";
import { usePlaybackStore } from "@/store/player.store";

function formatFps(value: number | undefined): string {
  return value === undefined ? "—" : `${value.toFixed(1)} fps`;
}

function formatCount(value: number | undefined): string {
  return value === undefined ? "—" : `${value}`;
}

function formatCache(value: number | undefined): string {
  return value === undefined ? "—" : `${value.toFixed(1)}s`;
}

function DiagnosticsOverlay() {
  const { t } = useI18n();

  const hasFile = usePlaybackStore((state) => state.hasFile);
  const fpsRender = usePlaybackStore((state) => state.fpsRender);
  const fpsVideo = usePlaybackStore((state) => state.fpsVideo);
  const dropCount = usePlaybackStore((state) => state.dropCount);
  const cacheDuration = usePlaybackStore((state) => state.cacheDuration);
  const hwdecCurrent = usePlaybackStore((state) => state.hwdecCurrent);
  const videoWidth = usePlaybackStore((state) => state.videoWidth);
  const videoHeight = usePlaybackStore((state) => state.videoHeight);

  const rows: Array<{ label: string; value: string }> = [
    { label: t("player.media.diagnostics.fps.render"), value: formatFps(fpsRender) },
    { label: t("player.media.diagnostics.fps.video"), value: formatFps(fpsVideo) },
    { label: t("player.media.diagnostics.drops"), value: formatCount(dropCount) },
    { label: t("player.media.diagnostics.cache"), value: formatCache(cacheDuration) },
    { label: t("player.media.diagnostics.hwdec"), value: hwdecCurrent ?? "—" },
    {
      label: t("player.media.diagnostics.resolution"),
      value:
        videoWidth !== undefined && videoHeight !== undefined
          ? `${videoWidth}x${videoHeight}`
          : "—",
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
    <div className="windows95-border windows95-font absolute bottom-4 left-4 z-20 min-w-52 bg-primary/95 p-2 text-left text-sm">
      <div className="windows95-text mb-1 text-xs font-bold">
        {t("player.media.diagnostics.title")}
      </div>
      {!hasFile || waiting ? (
        <div className="text-xs">{t("player.media.diagnostics.empty")}</div>
      ) : (
        rows.map((row) => (
          <div key={row.label} className="mb-0.5 flex justify-between gap-2">
            <span className="text-muted text-xs">{row.label}:</span>{" "}
            <span className="font-bold tabular-nums">{row.value}</span>
          </div>
        ))
      )}
    </div>
  );
}

export default DiagnosticsOverlay;
