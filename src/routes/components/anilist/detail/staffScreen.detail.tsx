import { STAFF_CREDITS_PAGE_SIZE } from "@/config/system/pagination.config";
import { flattenMarkup } from "@/lib/core/text.utils";
import type { AniListOverlayContext, AniListOverlayScreen } from "@/types/anilist/anilist";

import { DetailProfileHeader } from "@/routes/components/anilist/detail/profileHeader.detail";
import { PersonFavButton } from "@/routes/components/anilist/detail/favbutton.detail";
import { DetailError } from "@/routes/components/anilist/detail/state/error.state";
import { DetailLoading } from "@/routes/components/anilist/detail/state/loading.state";
import { useStaffPage } from "@/hooks/anilist/staff.hook";
import { StaffCharactersSection } from "@/routes/components/anilist/detail/staffCharacters.detail";
import { StaffAboutSection } from "@/routes/components/anilist/detail/staffAbout.detail";
import { StaffMediaSection } from "@/routes/components/anilist/detail/staffMedia.detail";

export function StaffScreen({
  screen,
  context,
}: {
  screen: Extract<AniListOverlayScreen, { kind: "staff" }>;
  context: AniListOverlayContext;
}) {
  const characters = useStaffPage(
    "characters",
    screen.id,
    "characters",
    "charPage",
    STAFF_CREDITS_PAGE_SIZE
  );
  const media = useStaffPage("media", screen.id, "media", "page", STAFF_CREDITS_PAGE_SIZE);

  const profile = characters.data?.pages[0] ?? media.data?.pages[0];
  const about = flattenMarkup(profile?.about);

  if (characters.isLoading && media.isLoading) {
    return <DetailLoading />;
  }
  if (characters.isError && media.isError) {
    return (
      <DetailError
        onRetry={() => {
          characters.refetch();
          media.refetch();
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2 p-1">
      <DetailProfileHeader
        image={profile?.image ?? null}
        name={profile?.name ?? screen.name}
        nativeName={profile?.native_name ?? null}
        favourites={profile?.favourites ?? null}
        siteUrl={profile?.site_url ?? null}
        favButton={
          context.isLoggedIn ? (
            <PersonFavButton
              id={screen.id}
              favouriteIds={context.favouriteStaffIds}
              labelled
              onToggle={(id) => context.onStaffFavouriteToggle?.(id)}
            />
          ) : undefined
        }
      />

      <StaffAboutSection about={about} />

      <StaffCharactersSection query={characters} context={context} />
      <StaffMediaSection query={media} context={context} />
    </div>
  );
}
