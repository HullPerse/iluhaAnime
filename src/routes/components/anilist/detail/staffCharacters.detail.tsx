import { useMemo } from "react";

import { useI18n } from "@/hooks/i18n.hook";
import { uniqueById } from "@/lib/core/array.utils";
import type { StaffPage } from "@/hooks/anilist/staff.hook";
import type { AniListOverlayContext } from "@/types/anilist/anilist";

import { CreditSection } from "@/routes/components/anilist/detail/creditSection.detail";

export function StaffCharactersSection({
  query,
  context,
}: {
  query: StaffPage;
  context: AniListOverlayContext;
}) {
  const { t } = useI18n();
  const characters = useMemo(
    () =>
      uniqueById(
        (query.data?.pages ?? []).flatMap((page) => (page ? page.characters : [])),
        (character) => character.id
      ),
    [query.data]
  );
  return (
    <CreditSection
      header={t("anilist.characters.characters.of", {
        count: query.data?.pages[0]?.character_count || characters.length,
      })}
      items={characters.map((character) => ({
        id: character.id,
        image: character.image,
        label: character.name,
        favourite: context.favouriteCharacterIds?.has(character.id) ?? false,
      }))}
      hasNextPage={query.hasNextPage}
      isFetchingNextPage={query.isFetchingNextPage}
      onShowMore={() => query.fetchNextPage()}
      onSelect={(item) =>
        context.onPush({ kind: "character", id: item.id, name: item.label, voiceActors: [] })
      }
    />
  );
}
