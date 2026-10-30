import { useMemo } from "react";

import { useI18n } from "@/hooks/i18n.hook";
import { uniqueById } from "@/lib/core/array.utils";
import type { StaffPage } from "@/hooks/anilist/staff.hook";
import type { AniListOverlayContext } from "@/types/anilist/anilist";

import { CreditSection } from "@/routes/components/anilist/detail/creditSection.detail";

export function StaffMediaSection({
  query,
  context,
}: {
  query: StaffPage;
  context: AniListOverlayContext;
}) {
  const { t } = useI18n();
  const media = useMemo(
    () =>
      uniqueById(
        (query.data?.pages ?? []).flatMap((page) => (page ? page.media : [])),
        (item) => item.id
      ),
    [query.data]
  );
  return (
    <CreditSection
      header={t("anilist.characters.anime.of", {
        count: query.data?.pages[0]?.media_count || media.length,
      })}
      items={media.map((item) => ({ id: item.id, image: item.cover_url, label: item.title }))}
      hasNextPage={query.hasNextPage}
      isFetchingNextPage={query.isFetchingNextPage}
      onShowMore={() => query.fetchNextPage()}
      onSelect={(item) => context.onPush({ kind: "anime", id: item.id, name: item.label })}
    />
  );
}
