import type { SplashVariantProps } from "./shared.splash";
import { splashProgress, splashStageLabel } from "./shared.splash";

export function XpSplash({ stages, texts, fastLaunch, onToggleFastLaunch }: SplashVariantProps) {
  const progress = splashProgress(stages);
  const percent = Math.round(progress * 100);
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[100] overflow-x-clip overflow-y-auto"
      style={{ backgroundColor: "#000000", color: "#ffffff", fontFamily: "Tahoma, sans-serif" }}
    >
      <div className="relative mx-auto flex min-h-full w-full max-w-xl flex-col px-8 py-10">
        <p className="text-lg">{texts.xpBrand}</p>
        <div className="flex flex-1 flex-col items-center justify-center py-8">
          <p className="text-2xl">HullPerse</p>
          <p className="mt-1 text-6xl font-bold tracking-tight">
            Windows<span style={{ color: "#ff7f00" }}>xp</span>
          </p>
          <p className="mt-2 text-lg opacity-70">iluhaAnime</p>
          <div
            className="xp-track mt-10"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={texts.loading}
          >
            <div className="xp-fill" aria-hidden style={{ width: `${percent}%` }} />
            <span className="xp-block" aria-hidden />
            <span className="xp-block" aria-hidden />
            <span className="xp-block" aria-hidden />
          </div>
          <ul className="mt-6 w-full text-base leading-relaxed opacity-70">
            {stages.map((stage) => (
              <li key={stage.id} className={stage.status === "pending" ? "opacity-50" : undefined}>
                {stage.status === "done" ? "[x] " : stage.status === "degraded" ? "[!] " : "[ ] "}
                {splashStageLabel(texts, stage.id)}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex items-end justify-between gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-base opacity-80">
            <input
              type="checkbox"
              checked={fastLaunch}
              onChange={onToggleFastLaunch}
              className="size-4 accent-white"
            />
            {texts.fastLaunch}
          </label>
          <p className="text-right text-sm opacity-60">{texts.xpCopyright}</p>
        </div>
      </div>
    </div>
  );
}
