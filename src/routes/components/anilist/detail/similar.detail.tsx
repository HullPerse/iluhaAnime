import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { PosterTile } from "@/components/shared/posterTile.component";
import Section from "@/components/shared/section.component";
import { ANILIST_SIMILAR_LIMIT } from "@/config/anilist/detail.config";
import { anilistProxyArgs } from "@/lib/anilist/proxy.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { useSettingsStore } from "@/store/settings.store";
import type { AniRecommendation, AniRelation, FranchiseGraph } from "@/types/anilist";

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
  const recsQuery = useQuery({
    queryKey: ["anime_recommendations", animeId],
    queryFn: () =>
      invokeTyped<AniRecommendation[]>("get_anime_recommendations", {
        id: animeId,
        ...anilistProxyArgs(useSettingsStore.getState().anilistProxyUrl),
      }),
    staleTime: Infinity,
    retry: 1,
  });
  const franchiseQuery = useQuery({
    queryKey: ["anime_franchise_ids", animeId],
    queryFn: () =>
      invokeTyped<FranchiseGraph>("get_anime_franchise", {
        id: animeId,
        scope: "all",
        ...anilistProxyArgs(useSettingsStore.getState().anilistProxyUrl),
      }),
    staleTime: Infinity,
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
