import type { SplashVariantProps } from "@/types/core/shared.splash";
import { splashProgress, splashStageLabel } from "@/lib/splash/stages.utils";

const FONT = '"Perfect DOS VGA 437", monospace';

export function RetroismSplash({
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
      style={{ backgroundColor: "#000000", color: "#d8d8d8", fontFamily: FONT }}
    >
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center px-8 py-14">
        <p className="text-2xl">Starting MS-DOS...</p>
        <p className="mt-2 text-xl opacity-80">HIMEM is testing extended memory...done.</p>
        <ul className="mt-6 space-y-1 text-xl leading-relaxed">
          {stages.map((stage) => (
            <li key={stage.id} className={stage.status === "pending" ? "opacity-50" : undefined}>
              Loading {splashStageLabel(texts, stage.id)}...
              {stage.status === "done" ? " Done" : stage.status === "degraded" ? " Failed" : ""}
              {stage.status === "active" ? <span className="yorha-cursor">_</span> : ""}
            </li>
          ))}
        </ul>
        <p className="mt-6 text-xl">C:\&gt; boot {Math.round(progress * 100)}%</p>
        <label className="mt-6 flex cursor-pointer items-center gap-2 text-xl">
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
