import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { Heart } from "lucide-react";
import { useState } from "react";

import { SmallLoader } from "@/components/shared/loader.component";
import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { anilistProxyArgs } from "@/lib/anilist/proxy.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { enterOrSpace } from "@/lib/utils/keyboard.utils";
import { useSettingsStore } from "@/store/settings.store";
import type { AniCharacterMediaEdge, AniVoiceActor, AniStaffDetail } from "@/types/anilist";
import { OverlayWindow } from "../overlayWindow.anilist";


function PersonFavButton({
  id,
  favouriteIds,
  labelled,
  onToggle,
}: {
  id: number;
  favouriteIds?: Set<number>;
  labelled?: boolean;
  onToggle?: (id: number) => void;
}) {
  const { t } = useI18n();
  const isFav = favouriteIds?.has(id) ?? false;
  const label = isFav ? t("anilist.details.remove.fav") : t("anilist.details.add.fav");
  const heart = (
    <Heart
      className={cn("size-4", isFav ? "fill-red-500 text-red-500" : "text-text")}
    />
  );
  if (labelled) {
    return (
      <Button
        variant="outline"
        onClick={() => onToggle?.(id)}
        title={label}
        aria-label={label}
        aria-pressed={isFav}
      >
        {heart}
      </Button>
    );
  }
  return (
    <Button
      size="icon"
      className="size-5"
      onClick={() => onToggle?.(id)}
      title={label}
      aria-label={label}
      aria-pressed={isFav}
    >
      {heart}
    </Button>
  );
}

function AniListCharacterDetailModal({
  characterId: initialId,
  characterName: initialName,
  voiceActors: initialVAs,
  isLoggedIn,
  favouriteCharacterIds,
  favouriteStaffIds,
  onCharacterFavouriteToggle,
  onStaffFavouriteToggle,
  onRelated,
  onClose,
}: {
  characterId: number;
  characterName: string;
  voiceActors: AniVoiceActor[];
  isLoggedIn: boolean;
  favouriteCharacterIds?: Set<number>;
  favouriteStaffIds?: Set<number>;
  onCharacterFavouriteToggle?: (id: number) => void;
  onStaffFavouriteToggle?: (id: number) => void;
  onRelated?: (id: number) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [currentId, setCurrentId] = useState(initialId);
  const [currentName, setCurrentName] = useState(initialName);
  const [currentVAs, setCurrentVAs] = useState(initialVAs);
  const [view, setView] = useState<"character" | "voiceActor">("character");
  const [selectedVa, setSelectedVa] = useState<AniVoiceActor | null>(null);

  const { data: media, isLoading: mediaLoading } = useQuery({
    queryKey: ["character_media", currentId],
    queryFn: () =>
      invokeTyped<AniCharacterMediaEdge[]>("get_character_media", {
        id: currentId,
        ...anilistProxyArgs(useSettingsStore.getState().anilistProxyUrl),
      }),
  });

  const { data: staffDetail } = useQuery({
    queryKey: ["staff_characters", selectedVa?.id],
    queryFn: () =>
      invokeTyped<AniStaffDetail>("get_staff_characters", {
        id: selectedVa!.id,
        ...anilistProxyArgs(useSettingsStore.getState().anilistProxyUrl),
      }),
    enabled: view === "voiceActor" && !!selectedVa,
  });

  const handleVaClick = (va: AniVoiceActor) => {
    setSelectedVa(va);
    setView("voiceActor");
  };

  const handleBackToCharacter = () => {
    setView("character");
    setSelectedVa(null);
  };

  const handleCharacterClick = (id: number, name: string) => {
    setCurrentId(id);
    setCurrentName(name);
    setCurrentVAs([]);
    setView("character");
    setSelectedVa(null);
  };
  const header = view === "voiceActor" && selectedVa ? selectedVa.name : currentName;

  return (
    <OverlayWindow
      header={header}
      onClose={onClose}
      onBack={view === "voiceActor" ? handleBackToCharacter : undefined}
    >
      {view === "voiceActor" && staffDetail ? (
        <div className="flex flex-col gap-3 p-1">
          <div className="flex flex-row items-start gap-3">
            {staffDetail.image && (
              <ImageComponent
                src={staffDetail.image}
                alt=""
                className="windows95-active-border h-28 w-20 shrink-0 object-cover"
              />
            )}
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1">
                <span className="windows95-text font-bold">{staffDetail.name}</span>
                {isLoggedIn && selectedVa && (
                  <PersonFavButton
                    id={selectedVa.id}
                    favouriteIds={favouriteStaffIds}
                    onToggle={onStaffFavouriteToggle}
                  />
                )}
              </div>
            </div>
          </div>

          {staffDetail.characters.length > 0 && (
            <div>
              <span className="windows95-text text-xs font-bold">
                {t("anilist.characters.characters.of", {
                  count: staffDetail.characters.length,
                })}
              </span>
              <div className="mt-1 flex flex-wrap gap-1">
                {staffDetail.characters.map((c) => (
                  <div
                    key={c.id}
                    role="button"
                    tabIndex={0}
                    aria-label={c.name}
                    onClick={() => handleCharacterClick(c.id, c.name)}
                    onKeyDown={enterOrSpace(() => handleCharacterClick(c.id, c.name))}
                    className="hover:bg-surface flex w-14 cursor-pointer flex-col items-center gap-0.5 p-0.5"
                    title={c.name}
                  >
                    {c.image ? (
                      <ImageComponent
                        src={c.image}
                        alt=""
                        className="windows95-active-border h-16 w-12 object-cover"
                      />
                    ) : (
                      <div className="windows95-active-border flex h-16 w-12 items-center justify-center bg-white text-xs font-bold">
                        ?
                      </div>
                    )}
                    <span className="windows95-text w-full truncate text-center text-xs leading-tight">
                      {c.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {staffDetail.media.length > 0 && (
            <div>
              <span className="windows95-text text-xs font-bold">
                {t("anilist.characters.anime.of", {
                  count: staffDetail.media.length,
                })}
              </span>
              <div className="mt-1 flex flex-wrap gap-1">
                {staffDetail.media.map((m) => (
                  <div
                    key={m.id}
                    role="button"
                    tabIndex={0}
                    aria-label={m.title}
                    onClick={() => onRelated?.(m.id)}
                    onKeyDown={enterOrSpace(() => onRelated?.(m.id))}
                    className="hover:bg-surface flex w-14 cursor-pointer flex-col items-center gap-0.5 p-0.5"
                    title={m.title}
                  >
                    {m.cover_url ? (
                      <ImageComponent
                        src={m.cover_url}
                        alt=""
                        className="windows95-active-border h-16 w-12 object-cover"
                      />
                    ) : (
                      <div className="windows95-active-border flex h-16 w-12 items-center justify-center bg-white text-xs font-bold">
                        ?
                      </div>
                    )}
                    <span className="windows95-text w-full truncate text-center text-xs leading-tight">
                      {m.title}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3 p-1">
          {mediaLoading ? (
            <div className="flex items-center justify-center py-4">
              <SmallLoader size={5} className="windows95-text" />
            </div>
          ) : (
            <>
              {isLoggedIn && (
                <div>
                  <PersonFavButton
                    id={currentId}
                    favouriteIds={favouriteCharacterIds}
                    labelled
                    onToggle={onCharacterFavouriteToggle}
                  />
                </div>
              )}
              {currentVAs.length > 0 && (
                <div>
                  <span className="windows95-text text-xs font-bold">
                    {t("anilist.characters.voice.actors")}
                  </span>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {currentVAs.map((va) => (
                      <div
                        key={va.id}
                        role="button"
                        tabIndex={0}
                        aria-label={va.name}
                        onClick={() => handleVaClick(va)}
                        onKeyDown={enterOrSpace(() => handleVaClick(va))}
                        className="windows95-active-border bg-primary hover:bg-surface flex w-42 cursor-pointer flex-row items-center gap-2 p-1"
                      >
                        {va.image ? (
                          <ImageComponent
                            src={va.image}
                            alt=""
                            className="windows95-active-border h-18 w-13 shrink-0 object-cover"
                          />
                        ) : (
                          <div className="windows95-active-border flex h-8 w-8 items-center justify-center bg-white text-xs font-bold">
                            ?
                          </div>
                        )}
                        <div className="flex flex-col">
                          <span className="windows95-text text-xs leading-tight font-bold">
                            {va.name}
                          </span>
                          {va.native_name && (
                            <span className="windows95-text text-hint text-xs">
                              {va.native_name}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {media && media.length > 0 && (
                <div>
                  <span className="windows95-text text-xs font-bold">
                    {t("anilist.characters.appears.in", { count: media.length })}
                  </span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {media.map((m) => (
                      <div
                        key={m.id}
                        role="button"
                        tabIndex={0}
                        aria-label={m.title}
                        onClick={() => onRelated?.(m.id)}
                        onKeyDown={enterOrSpace(() => onRelated?.(m.id))}
                        className="hover:bg-surface flex w-14 cursor-pointer flex-col items-center gap-0.5 p-0.5"
                        title={m.title}
                      >
                        {m.cover_url ? (
                          <ImageComponent
                            src={m.cover_url}
                            alt=""
                            className="windows95-active-border h-16 w-12 object-cover"
                          />
                        ) : (
                          <div className="windows95-active-border flex h-16 w-12 items-center justify-center bg-white text-xs font-bold">
                            ?
                          </div>
                        )}
                        <span className="windows95-text w-full truncate text-center text-xs leading-tight">
                          {m.title}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </OverlayWindow>
  );
}

export default AniListCharacterDetailModal;
