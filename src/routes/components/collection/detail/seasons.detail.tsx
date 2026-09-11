import { useState } from "react";

import Section from "@/components/shared/section.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { CollectionItem } from "@/types/collection";

export function SeasonsCollection({ item }: { item: CollectionItem }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const seasons = item.detailsJson?.seasons ?? [];
  if (seasons.length === 0) return null;
  return (
    <Section
      header={t("collection.details.seasons")}
      expanded={expanded}
      onExpand={() => setExpanded((open) => !open)}
    >
      <div className="flex flex-col gap-0.5">
        {seasons.map((season) => {
          const current =
            item.tvCurrentSeason != null && item.tvCurrentSeason === season.seasonNumber;
          return (
            <div key={season.seasonNumber} className="flex gap-1 text-xs">
              <span className={current ? "font-bold" : undefined}>
                {t("collection.details.season")} {season.seasonNumber}
                {season.name ? ` - ${season.name}` : ""}
              </span>
              <span className="text-hint ml-auto shrink-0">
                {season.episodeCount} {t("collection.details.episode")}
              </span>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
