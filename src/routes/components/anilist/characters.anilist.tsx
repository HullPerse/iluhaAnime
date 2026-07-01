import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type { AniCharacterEdge } from "@/types/anilist";
import Section from "@/components/shared/section.component";
import { useState } from "react";

function AniListCharactersPanel({ animeId }: { animeId: number }) {
  const [showCharacters, setShowCharacters] = useState<boolean>(false);

  const { data, isLoading } = useQuery({
    queryKey: ["anime_characters", animeId],
    queryFn: () =>
      invoke<AniCharacterEdge[]>("get_anime_characters", {
        id: animeId,
        page: 1,
      }),
  });

  if (isLoading) return null;
  if (!data?.length) return null;

  return (
    <Section
      header="Персонажи"
      className="flex flex-wrap gap-1 bg-white"
      expanded={showCharacters}
      onExpand={() => setShowCharacters((prev) => !prev)}
      files={data.length}
    >
      {data.slice(0, 40).map((edge) => (
        <div
          key={edge.character.id}
          className="flex flex-col items-center gap-0.5 p-0.5"
          title={edge.character.name}
        >
          {edge.character.image ? (
            <img
              src={edge.character.image}
              alt=""
              className="h-20 w-14 object-cover windows95-active-border"
            />
          ) : (
            <div className="w-10 h-12 windows95-active-border bg-white flex items-center justify-center text-[8px] font-bold">
              ?
            </div>
          )}
          <span
            className="text-[8px] windows95-text truncate w-10 text-center leading-tight"
            title={edge.character.name}
          >
            {edge.character.name}
          </span>
        </div>
      ))}
    </Section>
  );
}

export default AniListCharactersPanel;
