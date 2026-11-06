import { useCallback, useEffect, useRef, useState } from "react";

import { useI18n } from "@/hooks/i18n.hook";
import { attempt } from "@hullperse/hp_utils/attempt";
import { invokeValidatedOrThrow } from "@/lib/core/system/invoke.utils";
import { PreviewFrameListSchema } from "@/api/upscale.schema";
import { ignore } from "@/lib/core/shared/promise.utils";
import type { PreviewFrame } from "@/types/core/upscale";
import type { UpscalePreviewController } from "@/types/core/upscalePreview";

interface PreviewState {
  key: string;
  frames: PreviewFrame[];
  loading: boolean;
  error: string | null;
}

const EMPTY_STATE = (key: string): PreviewState => ({
  key,
  frames: [],
  loading: false,
  error: null,
});

function requestKeyFor(
  filePath: string,
  resolution: string,
  selectedShaders: string[],
  temporalDenoise: boolean
): string {
  return `${filePath}|${resolution}|${selectedShaders.join(",")}|${temporalDenoise}`;
}

export function useUpscalePreview({
  filePath,
  resolution,
  selectedShaders,
  temporalDenoise,
}: {
  filePath: string;
  resolution: string;
  selectedShaders: string[];
  temporalDenoise: boolean;
}): UpscalePreviewController {
  const { t } = useI18n();
  const requestKey = requestKeyFor(filePath, resolution, selectedShaders, temporalDenoise);
  const [state, setState] = useState<PreviewState>(() => EMPTY_STATE(requestKey));
  const latestKeyRef = useRef<string>(requestKey);

  useEffect(() => {
    latestKeyRef.current = requestKey;
  }, [requestKey]);

  useEffect(() => {
    setState((prev) => (prev.key === requestKey ? prev : EMPTY_STATE(requestKey)));
  }, [requestKey]);

  const load = useCallback(() => {
    const dims = resolution === "original" ? [0, 0] : resolution.split("x").map(Number);
    if (dims.length !== 2 || dims.some((dim) => !Number.isInteger(dim) || dim < 0)) {
      setState({ ...EMPTY_STATE(requestKey), error: t("player.upscale.preview.failed") });
      return;
    }
    const [w, h] = dims;
    setState((prev) => ({
      key: requestKey,
      frames: prev.key === requestKey ? prev.frames : [],
      loading: true,
      error: null,
    }));
    ignore(
      attempt(
        invokeValidatedOrThrow("preview_upscale_frames", PreviewFrameListSchema, {
          height: h,
          inputPath: filePath,
          selectedShaders,
          temporalDenoise,
          width: w,
        })
      ).then(([data, err]) => {
        if (latestKeyRef.current !== requestKey) return;
        if (err || !data) {
          setState({
            ...EMPTY_STATE(requestKey),
            error: err ? err.message : t("player.upscale.preview.failed"),
          });
          return;
        }
        setState({ key: requestKey, frames: data, loading: false, error: null });
        return null;
      })
    );
  }, [filePath, requestKey, resolution, selectedShaders, t, temporalDenoise]);

  if (state.key !== requestKey) return { ...EMPTY_STATE(requestKey), load };
  return { frames: state.frames, loading: state.loading, error: state.error, load };
}
