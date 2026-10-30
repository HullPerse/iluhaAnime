import type { SplashVariantProps } from "@/types/shared.splash";
import { splashProgress, splashStageLabel } from "./shared.splash";

const FONT = '"Perfect DOS VGA 437", monospace';

export function Win95Splash({ stages, texts, fastLaunch, onToggleFastLaunch }: SplashVariantProps) {
  const progress = splashProgress(stages);
  const cells = 20;
  const filled = Math.round(progress * cells);
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[100] overflow-x-clip overflow-y-auto"
      style={{ backgroundColor: "#0000aa", color: "#ffffff", fontFamily: FONT }}
    >
      <div className="mx-auto flex min-h-full w-full max-w-xl flex-col items-center justify-center px-6 py-16">
        <p
          className="px-4 py-0.5 text-2xl font-bold tracking-wide"
          style={{ backgroundColor: "#aaaaaa", color: "#0000aa" }}
        >
          iluhaAnime
        </p>
        <p className="mt-6 text-xl">{texts.loading}</p>
        <ul className="mt-6 w-full text-left text-xl leading-relaxed">
          {stages.map((stage) => (
            <li key={stage.id} className={stage.status === "pending" ? "opacity-50" : undefined}>
              {stage.status === "done" ? "[x] " : stage.status === "degraded" ? "[!] " : "[ ] "}
              {splashStageLabel(texts, stage.id)}
              {stage.status === "active" ? "..." : ""}
            </li>
          ))}
        </ul>
        <div
          className="mt-6 flex w-full gap-1"
          role="progressbar"
          aria-valuenow={Math.round(progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          {Array.from({ length: cells }, (_, index) => (
            <span
              key={index}
              className="h-5 flex-1"
              style={{
                backgroundColor: index < filled ? "#ffffff" : "transparent",
                border: "2px solid #ffffff",
              }}
            />
          ))}
        </div>
        <label className="mt-8 flex cursor-pointer items-center gap-2 text-xl">
          <input
            type="checkbox"
            checked={fastLaunch}
            onChange={onToggleFastLaunch}
            className="size-5 accent-white"
          />
          {texts.fastLaunch}
        </label>
      </div>
    </div>
  );
}
