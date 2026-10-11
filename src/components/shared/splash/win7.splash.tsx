import type { SplashVariantProps } from "./shared.splash";
import { splashProgress, splashStageLabel } from "./shared.splash";

const ORBS = ["#f65314", "#7cbb00", "#00a1f1", "#ffbb00"];

export function Win7Splash({ stages, texts, fastLaunch, onToggleFastLaunch }: SplashVariantProps) {
  const progress = splashProgress(stages);
  const percent = Math.round(progress * 100);
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[100] overflow-x-clip overflow-y-auto"
      style={{ backgroundColor: "#000000", color: "#ffffff", fontFamily: '"Segoe UI", sans-serif' }}
    >
      <div className="mx-auto flex min-h-full w-full max-w-xl flex-col items-center justify-center px-8 py-14">
        <div className="win7-motion flex items-center gap-3" aria-hidden>
          {ORBS.map((color) => (
            <span
              key={color}
              className="win7-orb"
              style={{ background: `radial-gradient(circle, ${color} 62%, transparent 63%)` }}
            />
          ))}
        </div>
        <p className="mt-8 text-4xl font-light">{texts.win7Brand}</p>
        <p className="mt-2 text-base opacity-60">{texts.win7Copyright}</p>
        <div
          className="win7-meter mt-8"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={texts.loading}
        >
          <div style={{ width: `${percent}%` }} />
        </div>
        <ul className="mt-6 w-full text-base leading-relaxed opacity-70">
          {stages.map((stage) => (
            <li key={stage.id} className={stage.status === "pending" ? "opacity-50" : undefined}>
              {stage.status === "done" ? "[x] " : stage.status === "degraded" ? "[!] " : "[ ] "}
              {splashStageLabel(texts, stage.id)}
            </li>
          ))}
        </ul>
        <label className="mt-8 flex cursor-pointer items-center gap-2 text-base opacity-80">
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
