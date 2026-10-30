import type { SplashVariantProps } from "@/types/core/shared.splash";
import { splashProgress, splashStageLabel, stageMarker } from "@/lib/splash/stages.utils";

const FONT = '"Perfect DOS VGA 437", monospace';

export function TerminalSplash({
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
      className="fixed inset-0 z-[100] overflow-x-clip overflow-y-auto"
      style={{ backgroundColor: "#0c0c0c", color: "#00ff41", fontFamily: FONT }}
    >
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center px-8 py-14">
        <p className="text-xl font-bold tracking-[0.2em]">iluhaAnime terminal boot</p>
        <ul className="mt-8 space-y-1 text-xl leading-relaxed">
          {stages.map((stage) => (
            <li key={stage.id} className={stage.status === "pending" ? "opacity-50" : undefined}>
              {stageMarker(stage.status)} {splashStageLabel(texts, stage.id)}
              {stage.status === "active" ? "_" : ""}
            </li>
          ))}
        </ul>
        <div
          className="mt-8 h-5 w-full border-2"
          style={{ borderColor: "#00ff41" }}
          role="progressbar"
          aria-valuenow={Math.round(progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full"
            style={{ width: `${Math.round(progress * 100)}%`, backgroundColor: "#00ff41" }}
          />
        </div>
        <label className="mt-8 flex cursor-pointer items-center gap-2 text-xl">
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
