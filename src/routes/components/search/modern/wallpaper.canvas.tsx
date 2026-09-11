import { cn } from "cn";
import { useEffect, useRef, useState } from "react";

import { useI18n } from "@/lib/locale/i18n.utils";

export const WALLPAPER_PARALLAX_RANGE = 18;

const WALLPAPER_MAX_DPR = 2;
const WALLPAPER_LOAD_RETRIES = 2;

interface WallpaperCanvasProps {
  src: string;
  alt: string;
  className?: string;
  filter?: string;
  parallax?: boolean;
}

export default function WallpaperCanvas({
  src,
  alt,
  className,
  filter,
  parallax = false,
}: WallpaperCanvasProps) {
  const { t } = useI18n();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const sourceRef = useRef(src);
  const parallaxRef = useRef(parallax);
  const frameRef = useRef(0);
  const paintRef = useRef(() => {});
  const [paintedSrc, setPaintedSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const ready = paintedSrc !== null;

  useEffect(() => {
    paintRef.current = () => {
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      const image = imageRef.current;
      if (!canvas || !wrap || !image) return;
      const dpr = Math.min(
        WALLPAPER_MAX_DPR,
        typeof window === "undefined" ? 1 : window.devicePixelRatio || 1
      );
      const boxWidth = Math.max(1, wrap.clientWidth);
      const boxHeight = Math.max(1, wrap.clientHeight);
      const naturalWidth = image.naturalWidth;
      const naturalHeight = image.naturalHeight;
      if (naturalWidth <= 0 || naturalHeight <= 0) return;
      canvas.width = Math.max(1, Math.round(boxWidth * dpr));
      canvas.height = Math.max(1, Math.round(boxHeight * dpr));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setFailed(true);
        return;
      }
      const bleed = (parallaxRef.current ? WALLPAPER_PARALLAX_RANGE : 0) * dpr;
      const scale = Math.max(
        (canvas.width + bleed * 2) / naturalWidth,
        (canvas.height + bleed * 2) / naturalHeight
      );
      const drawWidth = naturalWidth * scale;
      const drawHeight = naturalHeight * scale;
      ctx.drawImage(
        image,
        (canvas.width - drawWidth) / 2,
        (canvas.height - drawHeight) / 2,
        drawWidth,
        drawHeight
      );
      setPaintedSrc(sourceRef.current);
    };
  });

  useEffect(() => {
    let alive = true;
    sourceRef.current = src;
    setFailed(false);
    if (canvasRef.current) canvasRef.current.style.transform = "";
    const attemptLoad = (attempt: number) => {
      if (!alive) return;
      const image = new Image();
      imageRef.current = image;
      image.crossOrigin = "anonymous";
      image.onload = () => {
        if (!alive || imageRef.current !== image) return;
        paintRef.current();
      };
      image.onerror = () => {
        if (!alive || imageRef.current !== image) return;
        if (attempt < WALLPAPER_LOAD_RETRIES) attemptLoad(attempt + 1);
        else setFailed(true);
      };
      image.src = src;
    };
    attemptLoad(0);
    return () => {
      alive = false;
      if (imageRef.current) {
        imageRef.current.onload = null;
        imageRef.current.onerror = null;
      }
    };
  }, [src]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => paintRef.current());
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    parallaxRef.current = parallax;
    if (!parallax && canvasRef.current) canvasRef.current.style.transform = "";
    paintRef.current();
  }, [parallax]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || !parallax || failed) return;
    if (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const write = (clientX: number, clientY: number) => {
      frameRef.current = 0;
      const rect = wrap.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const target = canvasRef.current;
      if (!target) return;
      const nx = (clientX - rect.left) / rect.width - 0.5;
      const ny = (clientY - rect.top) / rect.height - 0.5;
      target.style.transform = `translate3d(${(-nx * 2 * WALLPAPER_PARALLAX_RANGE).toFixed(2)}px, ${(-ny * 2 * WALLPAPER_PARALLAX_RANGE).toFixed(2)}px, 0)`;
    };
    const onMove = (event: MouseEvent) => {
      if (frameRef.current !== 0) return;
      const { clientX, clientY } = event;
      if (typeof window.requestAnimationFrame !== "function") {
        write(clientX, clientY);
        return;
      }
      frameRef.current = window.requestAnimationFrame(() => write(clientX, clientY));
    };
    const onLeave = () => {
      if (frameRef.current !== 0) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = 0;
      }
      if (canvasRef.current) canvasRef.current.style.transform = "";
    };
    wrap.addEventListener("mousemove", onMove);
    wrap.addEventListener("mouseleave", onLeave);
    return () => {
      wrap.removeEventListener("mousemove", onMove);
      wrap.removeEventListener("mouseleave", onLeave);
      if (frameRef.current !== 0) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    };
  }, [parallax, failed]);

  if (failed) {
    return (
      <div
        className={cn("relative flex w-full items-center overflow-hidden", className)}
        aria-busy="false"
      >
        <div
          className="border-primary/20 bg-background/40 flex h-full w-full items-center justify-center border"
          role="img"
          aria-label={alt || t("image.unavailable")}
        >
          <span className="text-hint text-xs">{t("image.fallback")}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      className={cn("relative flex w-full items-center overflow-hidden", className)}
      aria-busy={!ready}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full transition-opacity duration-200"
        style={{ filter, opacity: ready ? 1 : 0 }}
        role="img"
        aria-label={alt}
        data-src={paintedSrc ?? undefined}
      />
    </div>
  );
}
