import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { anilistApi } from "@/api/anilist.api";
import Section from "@/components/shared/section.component";
import { Button } from "@/components/ui/button.component";
import { ANILIST_SIMILAR_LIMIT, ANILIST_SIMILAR_SCROLL_STEP } from "@/config/anilist/detail.config";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { itemMeta, strengthPercent } from "@/lib/anilist/anilistSimilar.utils";
import { queryKeys } from "@/lib/core/keys.utils";
import { useCell } from "@/lib/core/signal.hook";
import { patchSettings, settingsAtoms } from "@/store/settings.store";
import type { AniRecommendation, AniRelation } from "@/types/anilist/anilist";

import { SimilarRailCard } from "@/routes/components/anilist/similar/card.similar";
import { SimilarListRow } from "@/routes/components/anilist/similar/row.similar";

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
  const view = useCell(settingsAtoms.similarView);
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

  const isList = view === "list";
  const strengthLabel = t("anilist.details.similar.strength");
  const scroll = (direction: number) => {
    scroller.current?.scrollBy({ left: direction * ANILIST_SIMILAR_SCROLL_STEP });
  };
  const viewOptions: { value: typeof view; label: string }[] = [
    { value: "rail", label: t("anilist.details.similar.view.rail") },
    { value: "list", label: t("anilist.details.similar.view.list") },
  ];

  return (
    <Section
      header={t("anilist.details.similar")}
      className="bg-field flex flex-col gap-1 p-1"
      expanded={expanded}
      onExpand={() => setExpanded((prev) => !prev)}
      files={items.length}
    >
      <div className="flex flex-row items-center justify-between gap-1">
        <div
          role="group"
          aria-label={t("anilist.details.similar.view")}
          className="flex flex-row items-center gap-0.5"
        >
          {viewOptions.map((option) => (
            <Button
              key={option.value}
              className="h-5 px-1 text-xs"
              variant={option.value === view ? "outline" : "default"}
              aria-pressed={option.value === view}
              onClick={() => patchSettings({ similarView: option.value })}
            >
              {option.label}
            </Button>
          ))}
        </div>
        {!isList && (
          <div className="flex flex-row items-center gap-0.5">
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
        )}
      </div>
      {isList ? (
        <div className="flex flex-col">
          {items.map((item, index) => (
            <SimilarListRow
              key={item.id}
              item={item}
              rank={index + 1}
              strength={strengthPercent(item.recommendation_rating, maxRating)}
              meta={itemMeta(item, t("anilist.details.eps.short"), true)}
              strengthLabel={strengthLabel}
              onOpen={onRelated}
            />
          ))}
        </div>
      ) : (
        <div ref={scroller} className="flex w-0 min-w-full snap-x gap-1 overflow-x-auto pb-1">
          {items.map((item, index) => (
            <SimilarRailCard
              key={item.id}
              item={item}
              rank={index + 1}
              strength={strengthPercent(item.recommendation_rating, maxRating)}
              meta={itemMeta(item, t("anilist.details.eps.short"))}
              strengthLabel={strengthLabel}
              onOpen={onRelated}
            />
          ))}
        </div>
      )}
    </Section>
  );
}
