import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button.component";
import { anilistProxyArgs } from "@/lib/anilist/proxy.utils";
import { flattenMarkup } from "@/lib/anilist/text.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { useSettingsStore } from "@/store/settings.store";
import type { AniListOverlayContext, AniListOverlayScreen, AniMedia } from "@/types/anilist";

import AniListMetadata from "./metadata.detail";
import { DetailError, DetailLoading } from "./screenState.detail";

/**
 * An anime reached from a character or staff credit opens here instead of replacing the anime
 * behind the overlay, so "back" returns to the character you came from. The full modal stays
 * one click away through `onOpenAnime`.
 */
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
    queryFn: () =>
      invokeTyped<AniMedia>("get_anime_by_id", {
        id: screen.id,
        ...anilistProxyArgs(useSettingsStore.getState().anilistProxyUrl),
      }),
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
