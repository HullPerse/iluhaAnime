import { Star } from "lucide-react";

import { useI18n } from "@/lib/locale/i18n.utils";
import { useFavPeopleAnimeSet } from "@/hooks/anilist/people.hook";

export function FavPeopleStar({
  animeId,
  className,
}: {
  animeId: number | null | undefined;
  className?: string;
}) {
  const { t } = useI18n();
  const favAnime = useFavPeopleAnimeSet();
  if (animeId == null || !favAnime.has(animeId)) return null;
  return (
    <span className="inline-flex shrink-0" title={t("anilist.details.fav.people")}>
      <Star
        className={className ?? "size-3 fill-yellow-400 text-yellow-600"}
        aria-label={t("anilist.details.fav.people")}
      />
    </span>
  );
}
