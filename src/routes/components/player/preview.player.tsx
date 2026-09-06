import { useState } from "react";

import { SmallLoader } from "@/components/shared/loader.component";
import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import { attempt } from "@/lib/utils/attempt.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import type { PreviewFrame } from "@/types/upscale";

export function UpscalePreview({
  filePath,
  resolution,
  selectedShaders,
  temporalDenoise,
}: {
  filePath: string;
  resolution: string;
  selectedShaders: string[];
  temporalDenoise: boolean;
}) {
  const { t } = useI18n();
  const [frames, setFrames] = useState<PreviewFrame[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(-1);
  const [showAfter, setShowAfter] = useState(true);
  const load = async () => {
    setLoading(true);
    setError(null);
    const [w, h] = resolution === "original" ? [0, 0] : resolution.split("x").map(Number);
    const [data, err] = await attempt(
      invokeTyped<PreviewFrame[]>("preview_upscale_frames", {
        height: h,
        inputPath: filePath,
        selectedShaders,
        temporalDenoise,
        width: w,
      })
    );
    setLoading(false);
    if (err || !data) {
      setError(err ? err.message : t("player.upscale.preview.failed"));
      return;
    }
    setFrames(data);
    setExpanded(-1);
  };

  const current = expanded >= 0 ? frames[expanded] : null;

  return (
    <div className="flex flex-col gap-1">
      <Button onClick={load} disabled={loading}>
        {loading ? <SmallLoader /> : null}
        {t("player.upscale.preview.button")}
      </Button>
      {error && <span className="text-destructive text-xs">{error}</span>}
      {frames.length > 0 && (
        <div className="flex flex-row gap-1 overflow-x-auto">
          {frames.map((frame, index) => (
            <button
              key={frame.timestamp}
              type="button"
              title={`${Math.round(frame.timestamp)}s`}
              onClick={() => {
                setExpanded(index);
                setShowAfter(true);
              }}
            >
              <img src={frame.before} alt="" className="h-16 w-auto" />
            </button>
          ))}
        </div>
      )}
      {current && (
        <Modal header={`${Math.round(current.timestamp)}s`} onClose={() => setExpanded(-1)}>
          <img
            src={showAfter ? current.after : current.before}
            alt=""
            className="max-h-[60vh] w-auto"
          />
          <div className="mt-1 flex flex-row justify-center gap-1">
            <Button onClick={() => setShowAfter(false)} disabled={!showAfter}>
              {t("player.upscale.preview.before")}
            </Button>
            <Button onClick={() => setShowAfter(true)} disabled={showAfter}>
              {t("player.upscale.preview.after")}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
