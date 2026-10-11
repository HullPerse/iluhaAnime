import type { SplashVariantProps } from "./shared.splash";
import { splashProgress } from "./shared.splash";

function stageLabel(texts: SplashVariantProps["texts"], id: string): string {
  if (id === "theme") return texts.theme;
  if (id === "migrations") return texts.migrations;
  if (id === "cache") return texts.cache;
  if (id === "database") return texts.database;
  if (id === "spelling") return texts.spelling;
  if (id === "index") return texts.index;
  return texts.tabs;
}

export function Win7Splash({ stages, texts, fastLaunch, onToggleFastLaunch }: SplashVariantProps) {
  const progress = splashProgress(stages);
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[100] overflow-y-auto"
      style={{ backgroundColor: "#1b5aa6", color: "#ffffff", fontFamily: '"Segoe UI", sans-serif' }}
    >
      <div className="mx-auto flex min-h-full w-full max-w-xl flex-col items-center justify-center px-8 py-14">
        <p className="text-4xl font-light">iluhaAnime</p>
        <p className="mt-2 text-lg opacity-80">{texts.loading}</p>
        <div
          className="mt-8 h-2 w-64 max-w-full bg-white/30"
          role="progressbar"
          aria-valuenow={Math.round(progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-full bg-white" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        <ul className="mt-6 text-lg leading-relaxed">
          {stages.map((stage) => (
            <li key={stage.id} className={stage.status === "pending" ? "opacity-50" : undefined}>
              {stage.status === "done" ? "[x] " : stage.status === "degraded" ? "[!] " : "[ ] "}
              {stageLabel(texts, stage.id)}
            </li>
          ))}
        </ul>
        <label className="mt-8 flex cursor-pointer items-center gap-2 text-lg">
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
