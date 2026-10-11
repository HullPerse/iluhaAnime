import type { SplashVariantProps } from "./shared.splash";
import { splashProgress, splashStageLabel } from "./shared.splash";

export function GenericSplash({
  stages,
  texts,
  fastLaunch,
  onToggleFastLaunch,
}: SplashVariantProps) {
  const progress = splashProgress(stages);
  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-background text-text fixed inset-0 z-100 overflow-x-clip overflow-y-auto"
    >
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-6 py-14">
        <div className="bg-surface windows95-active-border p-6">
          <p className="text-xl font-bold">iluhaAnime</p>
          <p className="text-muted mt-1 text-sm">{texts.loading}</p>
          <div
            className="bg-field windows95-active-border mt-4 h-4 w-full"
            role="progressbar"
            aria-valuenow={Math.round(progress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="bg-secondary h-full"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <ul className="mt-4 text-sm leading-relaxed">
            {stages.map((stage) => (
              <li key={stage.id} className={stage.status === "pending" ? "text-muted" : undefined}>
                {stage.status === "done" ? "[x] " : stage.status === "degraded" ? "[!] " : "[ ] "}
                {splashStageLabel(texts, stage.id)}
              </li>
            ))}
          </ul>
          <label className="windows95-text text-text mt-4 flex cursor-pointer items-center gap-1.5 text-xs select-none">
            <input
              type="checkbox"
              checked={fastLaunch}
              onChange={onToggleFastLaunch}
              className="size-4"
            />
            {texts.fastLaunch}
          </label>
        </div>
      </div>
    </div>
  );
}
