import { useQuery } from "@tanstack/react-query";

import { anilistApi } from "@/api/anilist.api";
import { Button } from "@/components/ui/button.component";
import { flattenMarkup } from "@/lib/anilist/text.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { AniListOverlayContext, AniListOverlayScreen } from "@/types/anilist";

import AniListMetadata from "./metadata.detail";
import { DetailError, DetailLoading } from "./screenState.detail";

export function AnimeScreen({
  screen,
  context,
}: {
  screen: Extract<AniListOverlayScreen, { kind: "anime" }>;
  context: AniListOverlayContext;
}) {
  const { t } = useI18n();
  const query = useQuery({
    queryKey: ["anime_detail", screen.id],
    queryFn: () => anilistApi.getAnimeById(screen.id),
  });

  if (query.isLoading) {
    return <DetailLoading />;
  }
  if (query.isError || !query.data) {
    return <DetailError onRetry={() => query.refetch()} />;
  }

  return (
    <div className="flex flex-col gap-2 p-1">
      <AniListMetadata anime={query.data} />
      {query.data.description && (
        <section className="windows95-border windows95-text bg-field max-h-40 overflow-y-auto p-1 text-xs leading-relaxed whitespace-pre-line">
          {flattenMarkup(query.data.description)}
        </section>
      )}
      <Button
        className="windows95-text self-start px-2 py-0.5 text-xs"
        onClick={() => context.onOpenAnime(screen.id)}
      >
        {t("anilist.characters.open.full")}
      </Button>
    </div>
  );
}
