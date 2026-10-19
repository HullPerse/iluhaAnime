import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { anilistApi } from "@/api/anilist.api";
import ProgressBar from "@/components/shared/progress.component";
import Section from "@/components/shared/section.component";
import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { ANILIST_SIMILAR_LIMIT } from "@/config/anilist/detail.config";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { queryKeys } from "@/lib/query/keys.utils";
import type { AniRecommendation, AniRelation } from "@/types/anilist";

const RAIL_SCROLL_STEP = 336;

function strengthPercent(rating: number, max: number): number {
  if (max <= 0) return 0;
  return Math.round((rating / max) * 100);
}

function cardMeta(item: AniRecommendation, episodesShort: string): string {
  const parts = [item.format];
  if (item.episodes) parts.push(`${item.episodes}${episodesShort}`);
  return parts.filter((part): part is string => Boolean(part)).join(" - ");
}

export function SimilarSection({
  animeId,
  relations,
  initialRecs,
  onRelated,
}: {
  animeId: number;
  relations: AniRelation[];
  initialRecs?: AniRecommendation[];
  onRelated?: (id: number) => void;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const recsQuery = useAppQuery("static", {
    queryKey: queryKeys.animeRecommendations(animeId),
    queryFn: () => anilistApi.getAnimeRecommendations(animeId),
    initialData: initialRecs && initialRecs.length > 0 ? initialRecs : undefined,
    retry: 1,
  });
  const franchiseQuery = useAppQuery("static", {
    queryKey: queryKeys.animeFranchiseRefresh(animeId, 0),
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
  const maxRating = useMemo(
    () => items.reduce((max, item) => Math.max(max, item.recommendation_rating), 0),
    [items]
  );

  if (recsQuery.isLoading || franchiseQuery.isLoading) return null;
  if (recsQuery.isError || items.length === 0) return null;

  const scroll = (direction: number) => {
    scroller.current?.scrollBy({ left: direction * RAIL_SCROLL_STEP });
  };

  return (
    <Section
      header={t("anilist.details.similar")}
      className="bg-field flex flex-col gap-1 p-1"
      expanded={expanded}
      onExpand={() => setExpanded((prev) => !prev)}
      files={items.length}
    >
      <div className="flex justify-end gap-0.5">
        <Button
          size="icon"
          className="size-5"
          aria-label={t("common.previous")}
          title={t("common.previous")}
          onClick={() => scroll(-1)}
        >
          <ChevronLeft className="size-3" />
        </Button>
        <Button
          size="icon"
          className="size-5"
          aria-label={t("common.next")}
          title={t("common.next")}
          onClick={() => scroll(1)}
        >
          <ChevronRight className="size-3" />
        </Button>
      </div>
      {/* w-0 + min-w-full: the rail contributes no intrinsic width to the fit-content modal,
          so the modal keeps its width and the cards scroll inside the rail. */}
      <div ref={scroller} className="flex w-0 min-w-full snap-x gap-1 overflow-x-auto pb-1">
        {items.map((item, index) => {
          const strength = strengthPercent(item.recommendation_rating, maxRating);
          const meta = cardMeta(item, t("anilist.details.eps.short"));
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onRelated?.(item.id)}
              title={meta === "" ? item.title : `${item.title} - ${meta}`}
              className="group/card windows95-text hover:bg-surface flex w-28 shrink-0 snap-start flex-col gap-0.5 p-0.5 text-left"
            >
              <span className="windows95-active-border relative flex aspect-3/4 w-full overflow-hidden">
                <ImageComponent
                  src={item.cover_url ?? ""}
                  alt={item.title}
                  className="h-full w-full"
                />
                <span className="windows95-text bg-secondary text-title-text absolute top-0 left-0 px-0.5 text-xs leading-tight tabular-nums">
                  #{index + 1}
                </span>
                {item.score ? (
                  <span className="windows95-text bg-secondary text-title-text absolute right-0 bottom-0 px-0.5 text-xs leading-tight">
                    ★ {item.score}
                  </span>
                ) : null}
              </span>
              <span className="line-clamp-2 h-7 text-xs leading-tight font-bold">{item.title}</span>
              {meta !== "" && <span className="text-hint text-xs">{meta}</span>}
              <span className="flex items-center gap-1">
                <ProgressBar
                  value={strength}
                  max={100}
                  className="h-2 min-w-12 flex-1"
                  ariaLabel={t("anilist.details.similar.strength")}
                />
                <span className="windows95-text w-7 shrink-0 text-right text-xs tabular-nums">
                  {strength}%
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </Section>
  );
}
