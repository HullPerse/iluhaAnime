import { useEffect, useState } from "react";

import { createInterval } from "@/lib/core/interval.utils";

import type { SplashVariantProps } from "@/types/core/shared.splash";
import { splashStageLabel } from "@/lib/splash/stages.utils";

export function YorhaSplash({ stages, texts, fastLaunch, onToggleFastLaunch }: SplashVariantProps) {
  const [dots, setDots] = useState(0);
  const [band, setBand] = useState({ size: 8, location: 40 });

  useEffect(() => {
    const dotsTask = createInterval(() => {
      setDots((value) => (value + 1) % 4);
    }, 300);
    const bandTask = createInterval(() => {
      setBand({
        size: 1 + Math.floor(Math.random() * 35),
        location: 1 + Math.floor(Math.random() * 90),
      });
    }, 100);
    return () => {
      dotsTask.cancel();
      bandTask.cancel();
    };
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[100] overflow-x-clip overflow-y-auto"
      style={{ backgroundColor: "#1f1b18", color: "#ffffff" }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 w-full"
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.05)",
          paddingTop: `${band.size}%`,
          bottom: `${band.location}%`,
        }}
      />
      <div aria-hidden className="yorha-grid pointer-events-none absolute inset-0" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center font-bold"
        style={{ color: "#35302a" }}
      >
        <p className="mr-[-0.1em] text-7xl tracking-[0.1em]">{texts.yorhaTitle}</p>
        <p className="mt-2 text-2xl">{texts.yorhaTagline}</p>
      </div>
      <div className="relative mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center px-8 py-14">
        <p className="yorha-glitch text-4xl font-bold tracking-[0.3em]">
          LOADING
          <span className="ml-4 text-2xl font-normal tracking-[0.2em]">
            - BOOTING SYSTEM {".".repeat(dots)}
          </span>
        </p>
        <ul className="yorha-glitch mt-8 space-y-2 text-xl leading-relaxed">
          {stages.map((stage) => (
            <li key={stage.id} className={stage.status === "pending" ? "opacity-50" : undefined}>
              {stage.status === "done" ? "[x] " : stage.status === "degraded" ? "[!] " : "[ ] "}
              {splashStageLabel(texts, stage.id)}
              {stage.status === "active" ? <span className="yorha-cursor">_</span> : ""}
            </li>
          ))}
        </ul>
        <label className="mt-10 flex cursor-pointer items-center gap-2 text-lg">
          <input
            type="checkbox"
            checked={fastLaunch}
            onChange={onToggleFastLaunch}
            className="size-4 accent-white"
          />
          {texts.fastLaunch}
        </label>
      </div>
    </div>
  );
}
