import { cn } from "cn";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DITHER_DEFAULTS } from "@/config/graphics/dither.config";
import { scheduleTask } from "@/lib/core/shared.utils";
import type { ScheduledTask } from "@/types/core/shared";
import { attempt, attemptSync } from "@/lib/core/attempt.utils";
import { renderDitherImage } from "@/lib/graphics/ditherRender.utils";
import {
  ditherCacheKey,
  ditherDecodeCache,
  ditherRenderCache,
  getDitherWorker,
  postDitherJob,
  resetDitherWorker,
  subscribeWorkerJob,
  withDitherDefaults,
} from "@/lib/graphics/dither.utils";
import type {
  DitherCacheEntry,
  DitherCanvasProps,
  DitherStatus,
  DitherWorkerProgress,
  DitherWorkerRequest,
  DitherWorkerResponse,
} from "@/types/graphics/dither";

import ImageComponent from "@/components/ui/image.component";

function DitherCanvas({
  src,
  className,
  ariaLabel,
  capToDisplay,
  maxLongSide,
  onError,
  onReady,
  onProgress,
  ref,
  scale,
  mode,
  matrix,
  strength,
  levels,
  palette,
  paletteMix,
  monochrome,
  contrast,
  grain,
  halftone,
  dotSize,
  dotSoftness,
  glyphs,
  glyphSize,
  scanlines,
  chromatic,
  barrel,
  vignette,
}: DitherCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onErrorRef = useRef<DitherCanvasProps["onError"]>(onError);
  const onReadyRef = useRef<DitherCanvasProps["onReady"]>(onReady);
  const onProgressRef = useRef<DitherCanvasProps["onProgress"]>(onProgress);
  const [status, setStatus] = useState<DitherStatus>("loading");
  const jobRef = useRef<number>(0);
  const setCanvasRefs = useCallback(
    (node: HTMLCanvasElement | null) => {
      canvasRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref]
  );
  const effectScale = scale ?? DITHER_DEFAULTS.scale;
  const effectOptions = useMemo(
    () =>
      withDitherDefaults({
        mode,
        matrix,
        strength,
        levels,
        palette,
        paletteMix,
        monochrome,
        contrast,
        grain,
        halftone,
        dotSize,
        dotSoftness,
        glyphs,
        glyphSize,
        scanlines,
        chromatic,
        barrel,
        vignette,
      }),
    [
      mode,
      matrix,
      strength,
      levels,
      palette,
      paletteMix,
      monochrome,
      contrast,
      grain,
      halftone,
      dotSize,
      dotSoftness,
      glyphs,
      glyphSize,
      scanlines,
      chromatic,
      barrel,
      vignette,
    ]
  );

  useEffect(() => {
    onErrorRef.current = onError;
    onReadyRef.current = onReady;
    onProgressRef.current = onProgress;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let task: ScheduledTask | null = null;
    let unsubscribeJob: (() => void) | null = null;
    const reportError = (message: string) => {
      console.error(message);
      const notify = onErrorRef.current;
      if (notify) notify(message);
      setStatus("error");
    };
    const markReady = () => {
      setStatus("ready");
      onReadyRef.current?.();
    };
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      reportError("DitherCanvas: 2D context is unavailable");
      return;
    }
    const keyFor = (scale: number) => ditherCacheKey(src, scale, effectOptions);
    const fitScale = (sourceWidth: number, sourceHeight: number) => {
      let scale = effectScale;
      if (capToDisplay) {
        const boxWidth = canvas.clientWidth;
        const boxHeight = canvas.clientHeight;
        if (boxWidth > 0 && boxHeight > 0 && sourceWidth > 0 && sourceHeight > 0) {
          scale = Math.min(scale, Math.max(boxWidth / sourceWidth, boxHeight / sourceHeight));
        }
      }
      if (maxLongSide !== undefined && sourceWidth > 0 && sourceHeight > 0) {
        scale = Math.min(scale, maxLongSide / Math.max(sourceWidth, sourceHeight));
      }
      return scale;
    };
    const paintEntry = (entry: DitherCacheEntry) => {
      canvas.width = entry.width;
      canvas.height = entry.height;
      ctx.putImageData(new ImageData(entry.pixels, entry.width, entry.height), 0, 0);
    };
    const image = new Image();
    image.crossOrigin = "anonymous";
    const processSource = (
      source: CanvasImageSource,
      sourceWidth: number,
      sourceHeight: number,
      renderScale: number,
      key: string
    ) => {
      if (cancelled) return;
      const [, processError] = attemptSync(() => {
        const width = Math.max(1, Math.round(sourceWidth * renderScale));
        const height = Math.max(1, Math.round(sourceHeight * renderScale));
        const work = document.createElement("canvas");
        work.width = width;
        work.height = height;
        const workCtx = work.getContext("2d", { willReadFrequently: true });
        if (!workCtx) {
          reportError("DitherCanvas: 2D context is unavailable");
          return;
        }
        workCtx.imageSmoothingEnabled = true;
        workCtx.drawImage(source, 0, 0, width, height);
        const pixels = workCtx.getImageData(0, 0, width, height).data;
        const jobId = jobRef.current + 1;
        jobRef.current = jobId;
        const worker = getDitherWorker();
        if (worker) {
          const onJobMessage = (event: MessageEvent<DitherWorkerResponse>) => {
            const { id, width: jobWidth, height: jobHeight, pixels } = event.data;
            if (cancelled || id !== jobRef.current) return;
            const fresh: DitherCacheEntry = {
              width: jobWidth,
              height: jobHeight,
              pixels: new Uint8ClampedArray(pixels),
            };
            ditherRenderCache.set(key, fresh);
            paintEntry(fresh);
            markReady();
          };
          const onJobError = () => {
            resetDitherWorker();
            if (!cancelled) reportError(`DitherCanvas: render worker failed for ${src}`);
          };
          const onJobProgress = (event: MessageEvent<DitherWorkerProgress>) => {
            const { id, done, total } = event.data;
            if (cancelled || id !== jobRef.current) return;
            onProgressRef.current?.(done, total);
          };
          unsubscribeJob = subscribeWorkerJob(worker, onJobMessage, onJobError, onJobProgress);
          const request: DitherWorkerRequest = {
            type: "render",
            id: jobId,
            width,
            height,
            pixels: pixels.buffer,
            options: effectOptions,
          };
          postDitherJob(worker, request, [pixels.buffer]);
        } else {
          const output = renderDitherImage(pixels, width, height, effectOptions, (doneRows) => {
            if (!cancelled) onProgressRef.current?.(doneRows, height);
          });
          const fresh: DitherCacheEntry = { width, height, pixels: output };
          ditherRenderCache.set(key, fresh);
          paintEntry(fresh);
          markReady();
        }
      });
      if (processError)
        reportError(`DitherCanvas: failed to process image ${src} (${processError.message})`);
    };
    const compute = (key: string | null) => {
      if (cancelled) return;
      const renderCached = (source: CanvasImageSource, sw: number, sh: number) => {
        if (key === null) {
          const scale = fitScale(sw, sh);
          const fitKey = keyFor(scale);
          const hit = ditherRenderCache.get(fitKey);
          if (hit) {
            paintEntry(hit);
            markReady();
            return;
          }
          processSource(source, sw, sh, scale, fitKey);
          return;
        }
        processSource(source, sw, sh, effectScale, key);
      };
      const cachedBitmap = ditherDecodeCache.get(src);
      if (cachedBitmap) {
        renderCached(cachedBitmap, cachedBitmap.width, cachedBitmap.height);
        return;
      }
      image.onload = () => {
        if (cancelled) return;
        if (typeof createImageBitmap === "function") {
          (async () => {
            const [bitmap, error] = await attempt(createImageBitmap(image));
            if (!error && bitmap) {
              if (cancelled) {
                bitmap.close();
                return;
              }
              ditherDecodeCache.set(src, bitmap);
              renderCached(bitmap, bitmap.width, bitmap.height);
              return;
            }
            renderCached(image, image.naturalWidth, image.naturalHeight);
          })();
        } else {
          renderCached(image, image.naturalWidth, image.naturalHeight);
        }
      };
      image.onerror = () => {
        reportError(`Failed to load image: ${src}`);
      };
      image.src = src;
    };
    if (capToDisplay || maxLongSide !== undefined) {
      setStatus("loading");
      compute(null);
    } else {
      const key = keyFor(effectScale);
      const cached = ditherRenderCache.get(key);
      if (cached) {
        paintEntry(cached);
        markReady();
        task = scheduleTask("raf", 0, () => compute(key));
      } else {
        setStatus("loading");
        compute(key);
      }
    }
    return () => {
      cancelled = true;
      task?.cancel();
      image.onload = null;
      image.onerror = null;
      unsubscribeJob?.();
    };
  }, [src, capToDisplay, maxLongSide, effectScale, effectOptions]);

  return (
    <div className={cn("relative", className)}>
      <ImageComponent
        src={src}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <canvas
        ref={setCanvasRefs}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ imageRendering: "pixelated" }}
        role={ariaLabel ? "img" : undefined}
        aria-label={ariaLabel}
        aria-hidden={ariaLabel ? undefined : true}
        aria-busy={status === "loading"}
      />
    </div>
  );
}

export default DitherCanvas;
