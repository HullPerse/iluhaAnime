import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";

import Pagination from "@/components/shared/pagination.component";
import Section from "@/components/shared/section.component";
import ImageComponent from "@/components/ui/image.component";
import { CHAR_PAGE_SIZE } from "@/config/pagination.config";
import { usePagination } from "@/hooks/pagination.hook";
import { useI18n } from "@/lib/i18n";
import { enterOrSpace } from "@/lib/keyboard.utils";
import { paginate } from "@/lib/pagination.utils";
import type { AniCharacterEdge, AniVoiceActor } from "@/types/anilist";

function AniListCharactersPanel({
  animeId,
  onCharacterClick,
}: {
  animeId: number;
  onCharacterClick?: (
    characterId: number,
    name: string,
    voiceActors: AniVoiceActor[]
  ) => void;
}) {
  const { t } = useI18n();
  const [showCharacters, setShowCharacters] = useState<boolean>(false);
  const [charPage, setCharPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["anime_characters", animeId],
    queryFn: () =>
      invoke<AniCharacterEdge[]>("get_anime_characters", {
        id: animeId,
        page: 1,
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
            onCharacterClick?.(
              edge.character.id,
              edge.character.name,
              edge.voice_actors
            )
          }
          onKeyDown={enterOrSpace(() =>
            onCharacterClick?.(
              edge.character.id,
              edge.character.name,
              edge.voice_actors
            )
          )}
          className="hover:bg-surface flex cursor-pointer flex-col items-center gap-0.5 p-0.5"
          title={edge.character.name}
        >
          {edge.character.image ? (
            <ImageComponent
              src={edge.character.image}
              alt="character.image"
              className="windows95-active-border h-20 w-14 object-cover"
            />
          ) : (
            <div className="windows95-active-border flex h-12 w-10 items-center justify-center bg-white text-xs font-bold">
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
