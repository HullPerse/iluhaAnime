import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { attempt } from "@/lib/utils/attempt.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import type { PreviewFrame } from "@/types/upscale";

export function PreviewZoom({ frame }: { frame: PreviewFrame }) {
  const { t } = useI18n();
  const [showAfter, setShowAfter] = useState(true);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <img src={showAfter ? frame.after : frame.before} alt="" className="max-h-[60vh] w-auto" />
      <div className="mt-1 flex flex-row justify-center gap-1">
        <Button onClick={() => setShowAfter(false)} disabled={!showAfter}>
          {t("player.upscale.preview.before")}
        </Button>
        <Button onClick={() => setShowAfter(true)} disabled={showAfter}>
          {t("player.upscale.preview.after")}
        </Button>
      </div>
    </div>
  );
}

export function UpscalePreview({
  filePath,
  resolution,
  selectedShaders,
  temporalDenoise,
  onZoom,
}: {
  filePath: string;
  resolution: string;
  selectedShaders: string[];
  temporalDenoise: boolean;
  onZoom: (frame: PreviewFrame) => void;
}) {
  const { t } = useI18n();
  const [frames, setFrames] = useState<PreviewFrame[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestKey = `${filePath}|${resolution}|${selectedShaders.join(",")}|${temporalDenoise}`;
  const latestKeyRef = useRef(requestKey);
  useEffect(() => {
    latestKeyRef.current = requestKey;
  }, [requestKey]);
  const load = async () => {
    const dims = resolution === "original" ? [0, 0] : resolution.split("x").map(Number);
    if (dims.length !== 2 || dims.some((dim) => !Number.isInteger(dim) || dim < 0)) {
      setError(t("player.upscale.preview.failed"));
      return;
    }
    const [w, h] = dims;
    setLoading(true);
    setError(null);
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
    if (latestKeyRef.current !== requestKey) return;
    if (err || !data) {
      setError(err ? err.message : t("player.upscale.preview.failed"));
      return;
    }
    setFrames(data);
  };

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
