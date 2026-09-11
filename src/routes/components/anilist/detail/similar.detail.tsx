import { useQuery } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { useMemo, useState } from "react";

import Section from "@/components/shared/section.component";
import ImageComponent from "@/components/ui/image.component";
import { useRemoteImage } from "@/hooks/remoteImage.hook";
import { anilistProxyArgs } from "@/lib/anilist/proxy.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import { enterOrSpace } from "@/lib/utils/keyboard.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { useSettingsStore } from "@/store/settings.store";
import type { AniRecommendation, AniRelation, FranchiseGraph } from "@/types/anilist";

const SIMILAR_LIMIT = 8;

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
      .slice(0, SIMILAR_LIMIT);
  }, [recsQuery.data, franchiseQuery.data, relations, animeId]);

  if (recsQuery.isLoading || franchiseQuery.isLoading) return null;
  if (recsQuery.isError || items.length === 0) return null;

  return (
    <Section
      header={t("anilist.details.similar")}
      className="flex flex-wrap gap-1 bg-white"
      expanded={expanded}
      onExpand={() => setExpanded((prev) => !prev)}
      files={items.length}
    >
      {items.map((item) => (
        <div
          role="button"
          tabIndex={0}
          aria-label={item.title}
          key={item.id}
          title={item.title}
          onClick={() => onRelated?.(item.id)}
          onKeyDown={enterOrSpace(() => onRelated?.(item.id))}
          className="windows95-active-border windows95-text hover:bg-surface bg-primary flex h-20 w-50 cursor-pointer flex-row items-center gap-2 px-1 py-0.5 text-left"
        >
          {item.cover_url && <SimilarCover url={item.cover_url} />}
          <section className="flex flex-col gap-1 leading-tight">
            <span className="windows95-text line-clamp-1 font-bold">{item.title}</span>
            <div className="flex flex-col text-xs">
              <span>
                - {t("anilist.details.format")}: {item.format && <>{item.format}</>}
              </span>
              <span className="flex flex-row gap-1">
                - {t("anilist.details.rating")}:{" "}
                {item.score && (
                  <>
                    {" "}
                    <Star className="inline size-2" /> {item.score}
                  </>
                )}
              </span>
              <span className="flex flex-row gap-1">
                - {t("anilist.details.episodes")}:
                {item.episodes && (
                  <>
                    {" "}
                    {item.episodes} {t("anilist.details.eps.short")}
                  </>
                )}
              </span>
            </div>
          </section>
        </div>
      ))}
    </Section>
  );
}

function SimilarCover({ url }: { url: string }) {
  const src = useRemoteImage(url);
  if (!src) return null;
  return (
    <ImageComponent
      src={src}
      alt="cover_url"
      className="windows95-active-border h-18 w-13 shrink-0"
    />
  );
}
