import { useEffect, useState } from "react";

import { applyOrderedDither } from "@/lib/dither.utils";

const cache = new Map<string, string>();

export function useDitheredImage(
  src: string | null | undefined,
  enabled: boolean,
  noise = 0.08
): string | null {
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !src) {
      setResult(null);
      return;
    }
    const key = `${src}|${noise}`;
    const cached = cache.get(key);
    if (cached) {
      setResult(cached);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      const schedule = (window as unknown as { requestIdleCallback?: (cb: () => void) => number })
        .requestIdleCallback;
      const run = () => {
        if (cancelled) return;
        try {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) {
            setResult(src);
            return;
          }
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          applyOrderedDither(imageData, noise);
          ctx.putImageData(imageData, 0, 0);
          const dataUrl = canvas.toDataURL("image/png");
          cache.set(key, dataUrl);
          if (!cancelled) setResult(dataUrl);
        } catch {
          if (!cancelled) setResult(src);
        }
      };
      if (schedule) schedule(run);
      else requestAnimationFrame(run);
    };
    img.onerror = () => {
      if (!cancelled) setResult(src);
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src, enabled, noise]);

  return result;
}
