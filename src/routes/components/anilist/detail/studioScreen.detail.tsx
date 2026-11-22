import { anilistApi } from "@/api/anilist.api";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { anilistCardUrl } from "@/lib/cards/links.utils";
import { queryKeys } from "@/lib/core/hotkeys/keys.utils";
import type { AniListOverlayContext, AniListOverlayScreen } from "@/types/anilist/anilistUi";

import { CreditSection } from "@/routes/components/anilist/detail/creditSection.detail";
import { DetailProfileHeader } from "@/routes/components/anilist/detail/profileHeader.detail";
import { DetailError } from "@/routes/components/anilist/detail/state/error.state";
import { DetailLoading } from "@/routes/components/anilist/detail/state/loading.state";

export function StudioScreen({
  screen,
  context,
}: {
  screen: Extract<AniListOverlayScreen, { kind: "studio" }>;
  context: AniListOverlayContext;
}) {
  const { t } = useI18n();
  const query = useAppQuery("slow", {
    queryKey: queryKeys.studioWorks(screen.id),
    queryFn: () => anilistApi.searchByStudio(screen.id),
  });

  if (query.isLoading) {
    return <DetailLoading />;
  }

  if (query.isError) {
    return <DetailError onRetry={() => query.refetch()} />;
  }

  return (
    <div className="flex flex-col gap-2 p-1">
      <DetailProfileHeader
        image={screen.image ?? null}
        name={screen.name}
        siteUrl={anilistCardUrl({ kind: "studio", entityId: screen.id })}
      />
      <CreditSection
        header={t("anilist.studio.works")}
        items={(query.data ?? []).map((item) => ({
          id: item.id,
          image: item.cover_url,
          label: item.title,
        }))}
        emptyLabel={t("anilist.studio.works.empty")}
        onSelect={(item) => context.onPush({ kind: "anime", id: item.id, name: item.label })}
      />
    </div>
  );
}
