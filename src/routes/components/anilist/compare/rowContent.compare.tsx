import { cn } from "cn";

import ImageComponent from "@/components/ui/image.component";
import { useI18n } from "@/hooks/i18n.hook";
import { formatSignedDelta } from "@/lib/core/compare.utils";
import type { CompareDiffKind } from "@/types/core/compare";
import type { AnilistScoreFormat } from "@/types/anilist/anilistScore";
import type { ComparedTitle } from "@/types/core/compare";
import { DIFF_CLASS, DIFF_SYMBOL } from "@/routes/components/anilist/compare/constants.compare";
import type { CompareTab } from "@/routes/components/anilist/compare/constants.compare";
import { ScoreCell } from "@/routes/components/anilist/compare/scoreCell.compare";

export function RowContent({
  row,
  tab,
  myFormat,
  friendFormat,
  friendName,
  diffKind,
}: {
  row: ComparedTitle;
  tab: CompareTab;
  myFormat: AnilistScoreFormat;
  friendFormat: AnilistScoreFormat;
  friendName: string;
  diffKind: CompareDiffKind;
}) {
  const { t } = useI18n();
  const altTitle = row.titles.find((title) => title !== row.title);
  const absoluteDelta = row.signedDelta == null ? "-" : (Math.abs(row.signedDelta) / 10).toFixed(1);
  const deltaTitle =
    row.signedDelta == null
      ? undefined
      : row.signedDelta > 0
        ? t("anilist.compare.diff.up", {
            value: absoluteDelta,
          })
        : row.signedDelta < 0
          ? t("anilist.compare.diff.down", {
              name: friendName,
              value: absoluteDelta,
            })
          : t("anilist.compare.diff.equal");
  return (
    <>
      {row.coverUrl ? (
        <ImageComponent
          src={row.coverUrl}
          alt=""
          className="windows95-active-border h-11 w-8 shrink-0 object-cover"
        />
      ) : (
        <span className="h-11 w-8 shrink-0" aria-hidden />
      )}
      <div className="min-w-0">
        <p className="windows95-text truncate text-xs">{row.title}</p>
        {altTitle && <p className="windows95-text text-hint truncate text-xs">{altTitle}</p>}
      </div>
      <ScoreCell
        score={row.mine}
        raw={row.mineRaw}
        format={myFormat}
        status={row.myStatus}
        progress={tab === "shared" ? null : row.myProgress}
        episodes={row.episodes}
        rawLabel={t("anilist.compare.you.short")}
      />
      <ScoreCell
        score={row.friend}
        raw={row.friendRaw}
        format={friendFormat}
        status={row.friendStatus}
        progress={tab === "shared" ? null : row.friendProgress}
        episodes={row.episodes}
        rawLabel={friendName}
      />
      <div className="flex min-w-0 flex-col items-end" title={deltaTitle}>
        <span
          className={cn(
            "windows95-text inline-block max-w-full truncate px-1 text-xs",
            DIFF_CLASS[diffKind]
          )}
        >
          {DIFF_SYMBOL[diffKind] ? `${DIFF_SYMBOL[diffKind]} ` : ""}
          {formatSignedDelta(row.signedDelta)}
        </span>
      </div>
    </>
  );
}
