import { cn } from "cn";
import { memo, useCallback, useEffect, useRef, useState } from "react";

import { useI18n } from "@/lib/locale/i18n.utils";
import type { ImageProps } from "@/types/ui";

const RETRY_DELAYS = [500, 1500];

const Image = ({
  src,
  alt,
  className,
  width,
  height,
  type = "cover",
  ...props
}: ImageProps) => {
  const { t } = useI18n();
  const [isLoaded, setIsLoaded] = useState(false);
  const [finalSrc, setFinalSrc] = useState(src);
  const [retryKey, setRetryKey] = useState(0);
  const attemptRef = useRef(0);
  const srcRef = useRef(src);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    srcRef.current = src;
    setFinalSrc(src);
    setIsLoaded(false);
    attemptRef.current = 0;
    return () => {
      clearTimeout(timerRef.current);
    };
  }, [src]);

  useEffect(() => {
    if (imgRef.current?.complete) setIsLoaded(true);
  }, []);

  const handleLoad = useCallback(() => setIsLoaded(true), []);

  const handleError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    if (e.currentTarget.getAttribute("src") !== srcRef.current) return;
    const attempt = attemptRef.current + 1;
    attemptRef.current = attempt;
    if (attempt <= RETRY_DELAYS.length) {
      const delay = RETRY_DELAYS[attempt - 1] ?? 1000;
      timerRef.current = setTimeout(() => setRetryKey((key) => key + 1), delay);
    } else {
      setFinalSrc("");
    }
  }, []);

  return (
    <div
      className={cn("relative flex w-full items-center overflow-hidden", className)}
      aria-busy={!isLoaded && Boolean(finalSrc)}
      style={{
        aspectRatio: width && height ? `${width}/${height}` : undefined,
      }}
    >
      {finalSrc ? (
        <>
          {!isLoaded && (
            <div
              className="absolute inset-0 animate-pulse bg-surface motion-reduce:animate-none"
              aria-hidden
            />
          )}
          <img
            key={retryKey}
            ref={imgRef}
            src={finalSrc}
            alt={alt}
            width={width}
            height={height}
            referrerPolicy="no-referrer"
            className={cn(
              "absolute inset-0 h-full w-full transition-opacity duration-200",
              type === "cover" ? "object-cover" : "object-contain",
              isLoaded ? "opacity-100" : "opacity-0"
            )}
            loading="lazy"
            decoding="async"
            onLoad={handleLoad}
            onError={handleError}
            {...props}
          />
        </>
      ) : (
        <div
          className="border-primary/20 bg-background/40 flex h-full w-full items-center justify-center border"
          role="img"
          aria-label={alt || t("image.unavailable")}
        >
          <span className="text-hint text-xs">{t("image.fallback")}</span>
        </div>
      )}
    </div>
  );
};

export default memo(Image);
