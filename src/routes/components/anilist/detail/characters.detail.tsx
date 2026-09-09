import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { useState } from "react";

import Pagination from "@/components/shared/pagination.component";
import Section from "@/components/shared/section.component";
import ImageComponent from "@/components/ui/image.component";
import { CHAR_PAGE_SIZE } from "@/config/anilist/pagination.config";
import { usePagination } from "@/hooks/pagination.hook";
import { useFavPeopleCharacterSet } from "@/hooks/anilist/people.hook";
import { anilistProxyArgs } from "@/lib/anilist/proxy.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { enterOrSpace } from "@/lib/utils/keyboard.utils";
import { paginate } from "@/lib/utils/pagination.utils";
import { useSettingsStore } from "@/store/settings.store";
import type { AniCharacterEdge, AniVoiceActor } from "@/types/anilist";

function AniListCharactersPanel({
  animeId,
  onCharacterClick,
}: {
  animeId: number;
  onCharacterClick?: (characterId: number, name: string, voiceActors: AniVoiceActor[]) => void;
}) {
  const { t } = useI18n();
  const [showCharacters, setShowCharacters] = useState<boolean>(false);
  const [charPage, setCharPage] = useState(1);
  const favCharacterIds = useFavPeopleCharacterSet();

  const { data, isLoading } = useQuery({
    queryKey: ["anime_characters", animeId],
    queryFn: () =>
      invokeTyped<AniCharacterEdge[]>("get_anime_characters", {
        id: animeId,
        page: 1,
        ...anilistProxyArgs(useSettingsStore.getState().anilistProxyUrl),
      }),
  });

  const { total, from, to, lastPage } = usePagination(
    data?.length ?? 0,
    CHAR_PAGE_SIZE,
    charPage,
    setCharPage
  );
  const paged = paginate(data ?? [], charPage, CHAR_PAGE_SIZE);

  if (isLoading) return null;
  if (!data?.length) return null;

  return (
    <Section
      header={t("anilist.characters.title")}
      className="flex flex-wrap gap-1 bg-white"
      expanded={showCharacters}
      onExpand={() => setShowCharacters((prev) => !prev)}
      files={data.length}
    >
      {paged.map((edge) => (
        <div
          key={edge.character.id}
          role="button"
          tabIndex={0}
          aria-label={edge.character.name}
          onClick={() =>
            onCharacterClick?.(edge.character.id, edge.character.name, edge.voice_actors)
          }
          onKeyDown={enterOrSpace(() =>
            onCharacterClick?.(edge.character.id, edge.character.name, edge.voice_actors)
          )}
          className="hover:bg-surface flex cursor-pointer flex-col items-center gap-0.5 p-0.5"
          title={edge.character.name}
        >
          {edge.character.image ? (
            <ImageComponent
              src={edge.character.image}
              alt="character.image"
              className={cn(
                "h-20 w-14 object-cover",
                favCharacterIds.has(edge.character.id)
                  ? "windows95-fav-border"
                  : "windows95-active-border"
              )}
            />
          ) : (
            <div
              className={cn(
                "flex h-12 w-10 items-center justify-center bg-white text-xs font-bold",
                favCharacterIds.has(edge.character.id)
                  ? "windows95-fav-border"
                  : "windows95-active-border"
              )}
            >
              ?
            </div>
          )}
          <span
            className="windows95-text w-10 truncate text-center text-xs leading-tight"
            title={edge.character.name}
          >
            {edge.character.name}
          </span>
        </div>
      ))}
      {total > CHAR_PAGE_SIZE && (
        <div className="w-full">
          <Pagination
            total={total}
            page={charPage}
            lastPage={lastPage}
            from={from}
            to={to}
            onPageChange={setCharPage}
          />
        </div>
      )}
    </Section>
  );
}

export default AniListCharactersPanel;
