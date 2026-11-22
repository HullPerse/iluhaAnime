import { mangaListStatuses } from "@/config/manga/tracking.config";
import { useCell } from "@hullperse/hp_utils/react";
import { Button } from "@/components/ui/button.component";
import Select from "@/components/ui/select.component";
import { useI18n } from "@/hooks/i18n.hook";
import type { AniFriend, AniUser } from "@/types/anilist/anilist";
import { search, account, section, listStatus } from "@/store/anilistMangaProfile.store";

export function ProfileControls({
  user,
  friends,
}: {
  user: AniUser;
  friends: readonly AniFriend[];
}) {
  const { t } = useI18n();
  const viewed = useCell(account);
  const isSearching = useCell(search);
  const active = useCell(section);
  const status = useCell(listStatus);

  return (
    <div className="ui-panel flex flex-wrap items-center gap-1 p-1">
      <Select
        value={viewed}
        onChange={(id) => account.set(id)}
        options={[
          { value: "", label: user.name },
          ...friends.map((friend) => ({ value: String(friend.id), label: friend.name })),
        ]}
        aria-label={t("manga.tracking.profile")}
      />
      {(["lists", "favourites", "stats", "activity"] as const).map((id) => (
        <Button
          key={id}
          aria-pressed={!isSearching && active === id}
          onClick={() => {
            section.set(id);
            search.set(false);
          }}
        >
          {t(`manga.tracking.${id}`)}
        </Button>
      ))}
      {!isSearching && active === "lists" && (
        <Select
          aria-label={t("manga.library.status")}
          value={status}
          onChange={(id) => listStatus.set(id)}
          options={[
            { value: "", label: t("manga.library.all") },
            ...mangaListStatuses.map(([id, label]) => ({ value: id, label: t(label) })),
          ]}
        />
      )}
    </div>
  );
}
