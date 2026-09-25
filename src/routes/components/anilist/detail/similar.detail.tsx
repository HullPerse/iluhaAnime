import { useMemo, useState } from "react";

import { anilistApi } from "@/api/anilist.api";
import { PosterTile } from "@/components/shared/posterTile.component";
import Section from "@/components/shared/section.component";
import { ANILIST_SIMILAR_LIMIT } from "@/config/anilist/detail.config";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { useI18n } from "@/lib/locale/i18n.utils";
import { queryKeys } from "@/lib/query/keys.utils";
import type { AniRelation } from "@/types/anilist";

export function SimilarSection({
  animeId,
  relations,
  onRelated,
}: {
  animeId: number;
  relations: AniRelation[];
  onRelated?: (id: number) => void;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const recsQuery = useAppQuery("static", {
    queryKey: queryKeys.animeRecommendations(animeId),
    queryFn: () => anilistApi.getAnimeRecommendations(animeId),
    retry: 1,
  });
  const franchiseQuery = useAppQuery("static", {
    queryKey: [...queryKeys.animeFranchise(animeId), 0] as const,
    queryFn: () => anilistApi.getAnimeFranchise(animeId, "all"),
    retry: 1,
  });
  const items = useMemo(() => {
    const recs = recsQuery.data ?? [];
    if (recs.length === 0) return [];
    const excluded = new Set<number>([animeId]);
    for (const relation of relations) excluded.add(relation.media.id);
    for (const node of franchiseQuery.data?.nodes ?? []) excluded.add(node.id);
    return recs
      .filter((rec) => !excluded.has(rec.id))
      .sort((a, b) => b.recommendation_rating - a.recommendation_rating)
      .slice(0, ANILIST_SIMILAR_LIMIT);
  }, [recsQuery.data, franchiseQuery.data, relations, animeId]);

  if (recsQuery.isLoading || franchiseQuery.isLoading) return null;
  if (recsQuery.isError || items.length === 0) return null;

  return (
    <Section
      header={t("anilist.details.similar")}
      className="bg-field flex flex-wrap gap-1"
      expanded={expanded}
      onExpand={() => setExpanded((prev) => !prev)}
      files={items.length}
    >
      {items.map((item) => {
        const details = [
          item.format,
          item.score ? `★ ${item.score}` : null,
          item.episodes ? `${item.episodes}${t("anilist.details.eps.short")}` : null,
        ].filter((part): part is string => Boolean(part));
        return (
          <PosterTile
            key={item.id}
            src={item.cover_url}
            label={item.title}
            alt={item.title}
            sublabel={details.join(" · ")}
            badge={`${Math.round(item.recommendation_rating)}%`}
            size="md"
            title={details.length > 0 ? `${item.title} — ${details.join(", ")}` : item.title}
            onSelect={() => onRelated?.(item.id)}
          />
        );
      })}
    </Section>
  );
}
