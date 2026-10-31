import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";

export function FilmstripTabs({
  hideTabs,
  showTrailer,
  trailerYoutubeId,
  trailerLabel,
  index,
  total,
  onFrames,
  onTrailer,
}: {
  hideTabs: boolean;
  showTrailer: boolean;
  trailerYoutubeId: string | null;
  trailerLabel: string;
  index: number;
  total: number;
  onFrames: () => void;
  onTrailer: () => void;
}) {
  const { t } = useI18n();
  const hasFrames = total > 0;

  return (
    <div className="flex flex-row items-center gap-1">
      {!hideTabs && (
        <>
          <Button className="h-5 px-1 text-xs" aria-pressed={!showTrailer} onClick={onFrames}>
            {t("common.frames")}
          </Button>
          {trailerYoutubeId && (
            <Button className="h-5 px-1 text-xs" aria-pressed={showTrailer} onClick={onTrailer}>
              {trailerLabel}
            </Button>
          )}
        </>
      )}
      <span className="windows95-text ml-auto text-xs">
        {showTrailer ? "▶" : `${hasFrames ? index + 1 : 0}/${total}`}
      </span>
    </div>
  );
}
