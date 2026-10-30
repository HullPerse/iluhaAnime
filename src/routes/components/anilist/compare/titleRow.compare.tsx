import { cn } from "cn";

import { compareDiff } from "@/lib/core/compare.utils";
import { COMPARE_DIFF_DEFAULT_THRESHOLD } from "@/config/anilist/compare.config";
import type { CompareDiffKind } from "@/types/core/compare";
import type { AnilistScoreFormat } from "@/types/anilist/anilistScore";
import type { ComparedTitle } from "@/types/core/compare";
import { DIFF_BORDER } from "@/routes/components/anilist/compare/constants.compare";
import type { CompareTab } from "@/routes/components/anilist/compare/constants.compare";
import { RowContent } from "@/routes/components/anilist/compare/rowContent.compare";

export function TitleRow({
  row,
  tab,
  myFormat,
  friendFormat,
  friendName,
  diffMode,
  onAnimeClick,
}: {
  row: ComparedTitle;
  tab: CompareTab;
  myFormat: AnilistScoreFormat;
  friendFormat: AnilistScoreFormat;
  friendName: string;
  diffMode: boolean;
  onAnimeClick?: (id: number) => void;
}) {
  const diffKind: CompareDiffKind = diffMode
    ? compareDiff(row.delta == null ? null : row.delta / 10, COMPARE_DIFF_DEFAULT_THRESHOLD)
    : "unknown";
  const className = cn(
    "grid w-full grid-cols-[2rem_minmax(0,1fr)_3.25rem_3.25rem_3.5rem] items-center gap-1 px-1 py-1.5 text-left",
    diffMode && "border-l-2",
    diffMode && DIFF_BORDER[diffKind],
    onAnimeClick ? "hover:bg-surface cursor-pointer bg-transparent" : ""
  );
  const content = (
    <RowContent
      row={row}
      tab={tab}
      myFormat={myFormat}
      friendFormat={friendFormat}
      friendName={friendName}
      diffKind={diffKind}
    />
  );
  if (!onAnimeClick) return <div className={className}>{content}</div>;
  return (
    <button
      type="button"
      title={row.title}
      onClick={() => onAnimeClick(row.id)}
      className={className}
    >
      {content}
    </button>
  );
}
