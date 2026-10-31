import { useState } from "react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import type { AnilistScoreFormat } from "@/types/anilist/anilistScore";
import type { ComparedTitle } from "@/types/core/compare";
import type { CompareTab } from "@/routes/components/anilist/compare/constants.compare";
import { EmptyRows } from "@/routes/components/anilist/compare/emptyRows.compare";
import { TitleRow } from "@/routes/components/anilist/compare/titleRow.compare";

export function TitleRows({
  rows,
  tab,
  query,
  myFormat,
  friendFormat,
  friendName,
  diffMode,
  onClear,
  onAnimeClick,
}: {
  rows: ComparedTitle[];
  tab: CompareTab;
  query: string;
  myFormat: AnilistScoreFormat;
  friendFormat: AnilistScoreFormat;
  friendName: string;
  diffMode: boolean;
  onClear: () => void;
  onAnimeClick?: (id: number) => void;
}) {
  const { t } = useI18n();
  const [showAll, setShowAll] = useState<boolean>(false);
  if (rows.length === 0) {
    return (
      <div className="border-t border-black/20">
        <EmptyRows tab={tab} query={query} friendName={friendName} onClear={onClear} />
      </div>
    );
  }
  const visible = showAll ? rows : rows.slice(0, 60);
  return (
    <div className="border-t border-black/20 p-1">
      <div className="text-hint grid w-full grid-cols-[2rem_minmax(0,1fr)_3.25rem_3.25rem_3.5rem] items-center gap-1 px-1 text-xs">
        <span />
        <span />
        <span className="text-right">{t("anilist.compare.you.short")}</span>
        <span className="truncate text-right">{friendName}</span>
        <span className="text-right">{t("anilist.compare.delta.short")}</span>
      </div>
      {visible.map((row) => (
        <TitleRow
          key={row.id}
          row={row}
          tab={tab}
          myFormat={myFormat}
          friendFormat={friendFormat}
          friendName={friendName}
          diffMode={diffMode}
          onAnimeClick={onAnimeClick}
        />
      ))}
      {rows.length > 60 && (
        <Button
          variant="outline"
          className="mt-1 h-6 text-xs"
          onClick={() => setShowAll((value) => !value)}
        >
          {showAll
            ? t("anilist.compare.show.less")
            : t("anilist.compare.show.more", { count: rows.length - 60 })}
        </Button>
      )}
    </div>
  );
}
