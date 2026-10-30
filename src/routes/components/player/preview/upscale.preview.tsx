import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import type { PreviewFrame } from "@/types/core/upscale";
import type { UpscalePreviewController } from "@/types/core/upscalePreview";

export function UpscalePreview({
  preview,
  onZoom,
}: {
  preview: UpscalePreviewController;
  onZoom: (frame: PreviewFrame) => void;
}) {
  const { t } = useI18n();
  const { frames, loading, error, load } = preview;
  return (
    <div className="flex flex-col gap-1">
      <Button onClick={load} loading={loading}>
        {t("player.upscale.preview.button")}
      </Button>
      {error && <span className="text-destructive text-xs">{error}</span>}
      {frames.length > 0 && (
        <div className="flex flex-row gap-1 overflow-x-auto">
          {frames.map((frame, index) => (
            <button
              key={`${frame.timestamp}-${index}`}
              type="button"
              title={`${Math.round(frame.timestamp)}s`}
              onClick={() => onZoom(frame)}
            >
              <img src={frame.before} alt="" className="h-16 w-auto" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
