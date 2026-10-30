import { useMemo } from "react";

import Select from "@/components/ui/select.component";
import { useI18n } from "@/hooks/i18n.hook";
import {
  compareVerdict,
  COMPARE_METRICS,
  formatSignedPercent,
  metricScore,
} from "@/lib/core/compare.utils";
import type { CompareMetric, CompareSummary } from "@/types/core/compare";
import type { AniUser, AniUserProfile } from "@/types/anilist/anilist";
import { toProfileProps, percent } from "@/lib/anilist/compareProfile.utils";
import { ProfileMini } from "@/routes/components/anilist/compare/profileMini.compare";
import { ConfidenceNote } from "@/routes/components/anilist/compare/confidenceNote.compare";
import { VERDICT_KEYS, METRIC_KEYS } from "@/routes/components/anilist/compare/constants.compare";

export function CompareHero({
  selfUser,
  friendProfile,
  friendName,
  summary,
  metric,
  onMetric,
}: {
  selfUser: AniUser | null;
  friendProfile: AniUserProfile | null;
  friendName: string;
  summary: CompareSummary;
  metric: CompareMetric;
  onMetric: (metric: CompareMetric) => void;
}) {
  const { t } = useI18n();
  const { taste } = summary;
  const verdict = compareVerdict(taste.score);
  const self = toProfileProps(selfUser, t("anilist.compare.me"));
  const friend = toProfileProps(friendProfile, friendName);
  const correlation = taste.spearman == null ? null : Math.round(taste.spearman * 100);
  const meanGap = summary.meanDelta == null ? "-" : (summary.meanDelta / 10).toFixed(1);
  const overlap = summary.libraryOverlap == null ? "-" : `${summary.libraryOverlap}%`;
  const selected = metricScore(metric, summary);
  const selectedText = metric === "mal" ? formatSignedPercent(selected) : percent(selected);
  const metricOptions = useMemo(
    () =>
      COMPARE_METRICS.map((value) => ({
        value,
        label: t(METRIC_KEYS[value]),
      })),
    [t]
  );
  return (
    <div className="p-2">
      <div className="flex items-center gap-2">
        <ProfileMini avatar={self.avatar} title={self.title} subtitle={self.subtitle} />
        <span className="windows95-text text-hint shrink-0 text-xs">VS</span>
        <ProfileMini avatar={friend.avatar} title={friend.title} subtitle={friend.subtitle} />
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <span className="windows95-text text-2xl leading-none font-bold">{selectedText}</span>
        <span className="windows95-text text-hint pb-0.5 text-xs">{t(METRIC_KEYS[metric])}</span>
      </div>
      <div className="mt-1 flex items-center gap-1">
        <span className="windows95-text text-hint text-xs">{t("anilist.compare.metric")}</span>
        <Select
          value={metric}
          onChange={(value) => onMetric(value as CompareMetric)}
          options={metricOptions}
          label={t("anilist.compare.metric")}
          className="min-w-0 flex-1"
        />
      </div>
      <p
        className="windows95-text text-hint mt-1 text-xs"
        title={[
          t("anilist.compare.component.gap", { value: percent(taste.gapScore) }),
          t("anilist.compare.component.rank", { value: percent(taste.rankScore) }),
          t("anilist.compare.component.direction", {
            value: percent(taste.directionScore),
          }),
          t("anilist.compare.direction.hint", {
            agree: taste.agree,
            split: taste.split,
            neutral: taste.neutral,
          }),
        ].join(" | ")}
      >
        {t("anilist.compare.match")}: {percent(taste.score)}
        {taste.score == null ? "" : ` (${t(VERDICT_KEYS[verdict])})`}
      </p>
      <p className="windows95-text text-hint text-xs">
        {t("anilist.compare.shared.total", { count: summary.shared.length })}
        {" | "}
        {t("anilist.compare.scored.count", { count: summary.sharedScoredCount })}
        {" | "}
        {t("anilist.compare.overlap", { value: overlap })}
      </p>
      <p className="windows95-text text-hint text-xs">
        {t("anilist.compare.mean.gap.short", { value: meanGap })}
        {" | "}
        {t("anilist.compare.correlation", { value: formatSignedPercent(correlation) })}
      </p>
      <ConfidenceNote taste={taste} />
    </div>
  );
}
