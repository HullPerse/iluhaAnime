import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";

function PlayerStatus({
  visible,
  finished,
  eofPaused,
  failed,
  loading,
  hasNext,
  streaming,
  onRestart,
  onRetry,
  onNext,
  onClose,
}: {
  visible: boolean;
  finished: boolean;
  eofPaused: boolean;
  failed: boolean;
  loading: boolean;
  hasNext: boolean;
  streaming: boolean;
  onRestart: () => void;
  onRetry: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();

  if (failed) {
    return (
      <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-black">
        <span className="windows95-text text-sm font-bold text-white">
          {t("player.media.error.title")}
        </span>
        <span className="windows95-text text-xs text-white">
          {t(streaming ? "player.media.error.hint.stream" : "player.media.error.hint")}
        </span>
        <div className="flex items-center gap-1">
          <Button className="h-auto px-2 py-1 text-xs" onClick={onRetry}>
            {t("player.media.error.retry")}
          </Button>
          <Button className="h-auto px-2 py-1 text-xs" onClick={onClose}>
            {t("player.media.panel.close")}
          </Button>
        </div>
      </div>
    );
  }

  if (!visible || loading || !(finished || eofPaused)) return null;

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-black">
      <span className="windows95-text text-sm font-bold text-white">
        {t("player.media.finished.title")}
      </span>
      <div className="flex items-center gap-1">
        <Button className="h-auto px-2 py-1 text-xs" onClick={onRestart}>
          {t("player.media.finished.replay")}
        </Button>
        {hasNext && (
          <Button className="h-auto px-2 py-1 text-xs" onClick={onNext}>
            {t("player.media.finished.next")}
          </Button>
        )}
        <Button className="h-auto px-2 py-1 text-xs" onClick={onClose}>
          {t("player.media.panel.close")}
        </Button>
      </div>
    </div>
  );
}

export default PlayerStatus;
