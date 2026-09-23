import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { anilistApi } from "@/api/anilist.api";
import { PosterTile } from "@/components/shared/posterTile.component";
import Section from "@/components/shared/section.component";
import { Button } from "@/components/ui/button.component";
import { characterRoleLabels } from "@/config/anilist/labels.config";
import { CHAR_PAGE_SIZE } from "@/config/anilist/pagination.config";
import { useFavPeopleCharacterSet } from "@/hooks/anilist/people.hook";
import { useI18n } from "@/lib/locale/i18n.utils";
import { uniqueById } from "@/lib/utils/array.utils";
import type { AniCharacterEdge, AniVoiceActor } from "@/types/anilist";

import { VoiceActorsPreview } from "./voiceActors.detail";

type RoleFilter = "all" | "MAIN" | "SUPPORTING";

function AniListCharactersPanel({
  animeId,
  onCharacterClick,
  onVoiceActorClick,
}: {
  animeId: number;
  onCharacterClick?: (characterId: number, name: string, voiceActors: AniVoiceActor[]) => void;
  onVoiceActorClick?: (
    character: { id: number; name: string; voiceActors: AniVoiceActor[] },
    voiceActor: AniVoiceActor
  ) => void;
}) {
  const { t } = useI18n();
  const [showCharacters, setShowCharacters] = useState<boolean>(false);
  const [role, setRole] = useState<RoleFilter>("all");
  const favCharacterIds = useFavPeopleCharacterSet();

  const query = useInfiniteQuery({
    queryKey: ["anime_characters", animeId],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => anilistApi.getAnimeCharacters(animeId, pageParam),
    getNextPageParam: (lastPage, pages) =>
      (Array.isArray(lastPage) ? lastPage.length : 0) < CHAR_PAGE_SIZE
        ? undefined
        : pages.length + 1,
  });

  const edges = useMemo(
    () =>
      uniqueById(
        (query.data?.pages ?? [])
          .flat()
          .filter((edge): edge is AniCharacterEdge => Boolean(edge?.character?.id)),
        (edge) => edge.character.id
      ),
    [query.data]
  );
  const visible = useMemo(
    () => (role === "all" ? edges : edges.filter((edge) => edge.role === role)),
    [edges, role]
  );
  const hasBothRoles = useMemo(
    () =>
      edges.some((edge) => edge.role === "MAIN") &&
      edges.some((edge) => edge.role === "SUPPORTING"),
    [edges]
  );

  const voiceActorPreview = (edge: AniCharacterEdge) => {
    if (edge.voice_actors.length === 0) return undefined;
    return (close: () => void) => (
      <VoiceActorsPreview
        voiceActors={edge.voice_actors}
        onSelect={
          onVoiceActorClick
            ? (voiceActor) => {
                close();
                onVoiceActorClick(
                  {
                    id: edge.character.id,
                    name: edge.character.name,
                    voiceActors: edge.voice_actors,
                  },
                  voiceActor
                );
              }
            : undefined
        }
      />
    );
  };

  if (query.isLoading) return null;
  if (edges.length === 0) return null;

  return (
    <Section
      header={t("anilist.characters.title")}
      className="bg-field flex flex-col gap-1"
      expanded={showCharacters}
      onExpand={() => setShowCharacters((prev) => !prev)}
      files={edges.length}
    >
      {hasBothRoles && (
        <div
          className="flex flex-wrap gap-1"
          role="group"
          aria-label={t("anilist.characters.role.filter")}
        >
          {(["all", "MAIN", "SUPPORTING"] as const).map((value) => (
            <Button
              key={value}
              variant={role === value ? "outline" : "default"}
              className="windows95-text px-1 py-0.5 text-xs"
              aria-pressed={role === value}
              onClick={() => setRole(value)}
            >
              {value === "all" ? t("anilist.characters.role.all") : t(characterRoleLabels[value])}
            </Button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {visible.map((edge) => (
          <PosterTile
            key={edge.character.id}
            size="lg"
            src={edge.character.image}
            label={edge.character.name}
            alt={edge.character.name}
            favourite={favCharacterIds.has(edge.character.id)}
            preview={voiceActorPreview(edge)}
            onSelect={() =>
              onCharacterClick?.(edge.character.id, edge.character.name, edge.voice_actors)
            }
          />
        ))}
      </div>

      {query.hasNextPage && (
        <Button
          className="windows95-text self-start px-1 py-0.5 text-xs"
          disabled={query.isFetchingNextPage}
          onClick={() => query.fetchNextPage()}
        >
          {t("anilist.characters.show.more")}
        </Button>
      )}
    </Section>
  );
}

export default AniListCharactersPanel;
