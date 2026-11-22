import type { ComponentType } from "react";

import ProgressBar from "@/components/shared/progress.component";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { clipMegabytes, clipProgressPercent } from "@/lib/daily/progress.utils";
import type { DailyClipProgress, DailyMode, DailyModeView } from "@/types/api/daily";
import type { TranslationKey } from "@/types/core/i18n";

function startLabelFor(view: DailyModeView | undefined): TranslationKey {
  if (view?.result) return "collection.game.result";

  if ((view?.attempts ?? 0) > 0) return "collection.game.continue";

  if (view?.state === "failed") return "collection.game.retry";

  return "collection.game.start";
}

export default function ModeCard({
  meta,
  view,
  onStart,
  onWarm,
  starting,
  progress,
}: {
  meta: {
    mode: DailyMode;
    titleKey: TranslationKey;
    descriptionKey: TranslationKey;
    Icon: ComponentType<{ className?: string }>;
    Art: ComponentType<{ className?: string }>;
  };
  view: DailyModeView | undefined;
  onStart: () => void;
  onWarm?: () => void;
  starting?: boolean;
  progress?: DailyClipProgress | null;
}) {
  const { t } = useI18n();
  const Art = meta.Art;
  const Icon = meta.Icon;
  const attempts = view?.attempts ?? 0;
  const modeResult = view?.result ?? null;
  const percent =
    progress === undefined || progress === null
      ? 0
      : clipProgressPercent(progress.received, progress.total);

  return (
    <article className="ui-panel daily-mode-card" onPointerEnter={onWarm} onFocus={onWarm}>
      <header className="daily-titlebar">
        <Icon className="size-3.5" />
        <h3 className="daily-titlebar-title">{t(meta.titleKey)}</h3>
        {modeResult !== null ? (
          <span className="daily-titlebar-meta">
            {t(modeResult.won ? "collection.game.won" : "collection.game.lost")}
          </span>
        ) : (
          attempts > 0 && (
            <span className="daily-titlebar-meta">
              {t("collection.game.attempts", {
                used: attempts,
                max: view?.maxAttempts ?? attempts,
              })}
            </span>
          )
        )}
      </header>
      <div className="daily-mode-body">
        <div className="windows95-border daily-mode-art-frame">
          <Art />
        </div>
        <div className="daily-mode-copy">
          <p>{t(meta.descriptionKey)}</p>
          {view?.error ? (
            <p className="daily-form-error" role="alert">
              {view.error}
            </p>
          ) : null}
          {progress ? (
            <div className="daily-mode-progress">
              <ProgressBar
                value={progress.received}
                max={progress.total}
                className="h-3 min-w-0 flex-1"
                ariaLabel={t("collection.game.state.pending")}
              />
              <em className="daily-mode-progress-value">{percent}%</em>
              <span className="daily-mode-progress-size">
                {t("collection.game.progress.size", {
                  received: clipMegabytes(progress.received),
                  total: clipMegabytes(progress.total),
                })}
              </span>
            </div>
          ) : null}
          <div className="daily-mode-actions">
            <Button className="daily-mode-start" onClick={onStart} loading={starting === true}>
              {t(startLabelFor(view))}
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}
