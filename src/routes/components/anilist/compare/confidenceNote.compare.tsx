import { COMPARE_LOW_CONFIDENCE_SCORED } from "@/config/anilist/compare.config";
import { useI18n } from "@/hooks/i18n.hook";
import type { TasteMatch } from "@/types/core/compare";
import { CONFIDENCE_KEYS } from "@/routes/components/anilist/compare/constants.compare";

export function ConfidenceNote({ taste }: { taste: TasteMatch }) {
  const { t } = useI18n();
  if (taste.confidence === "none") {
    return (
      <p className="windows95-text text-hint mt-1 text-xs">{t("anilist.compare.no.scores")}</p>
    );
  }
  if (taste.confidence === "low") {
    return (
      <p className="windows95-text text-destructive mt-1 text-xs">
        {t("anilist.compare.confidence.low", {
          count: taste.scoredCount,
          need: COMPARE_LOW_CONFIDENCE_SCORED,
        })}
      </p>
    );
  }
  return (
    <p className="windows95-text text-hint mt-1 text-xs">
      {t("anilist.compare.confidence.summary", {
        value: t(CONFIDENCE_KEYS[taste.confidence]),
        count: taste.scoredCount,
      })}
    </p>
  );
}
