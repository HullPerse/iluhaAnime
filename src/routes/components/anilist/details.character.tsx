import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { ChevronLeft, Monitor, X } from "lucide-react";
import { useState, useEffect } from "react";

import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { SmallLoader } from "@/components/shared/loader.component";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/index.utils";
import { enterOrSpace } from "@/lib/keyboard.utils";
import { useSettingsStore } from "@/store/settings.store";
import type {
  AniCharacterMediaEdge,
  AniVoiceActor,
  AniStaffDetail,
} from "@/types/anilist";

function OverlayWindow({
  header,
  onBack,
  onClose,
  children,
}: {
  header: string;
  onBack?: () => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const modalAnimation = useSettingsStore((s) => s.modalAnimation);
  const enable3dBorders = useSettingsStore((s) => s.enable3dBorders);
  const backdropOpacity = useSettingsStore((s) => s.modalBackdropOpacity);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!modalAnimation) {
      setVisible(true);
      return;
    }
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, [modalAnimation]);

  return (
    <main className="fixed inset-0 z-90 flex items-center justify-center">
      <div
        className={`absolute inset-0 ${modalAnimation ? "transition-opacity duration-150" : ""} ${visible ? "opacity-100" : "opacity-0"}`}
        style={{ backgroundColor: `rgba(0,0,0,${backdropOpacity / 100})` }}
        onClick={onClose}
      />
      <div
        className={cn(
          "bg-primary windows95-active-border relative flex h-fit max-h-[80%] min-h-42 w-fit max-w-[80%] min-w-lg flex-col",
          modalAnimation ? "transition-opacity duration-150" : "",
          visible ? "opacity-100" : "opacity-0",
          enable3dBorders ? "windows95-3d-border" : ""
        )}
      >
        <section className="bg-secondary flex w-full flex-row items-center justify-between p-1">
          <div className="flex min-w-0 flex-row items-center gap-1">
            {onBack && (
              <Button onClick={onBack} size="icon" className="size-4">
                <ChevronLeft className="size-2.5" />
              </Button>
            )}
            <Monitor className="size-3 shrink-0 text-white" />
            <span className="windows95-text line-clamp-1 font-bold text-white">
              {header}
            </span>
          </div>
          <div className="flex shrink-0 flex-row items-center gap-0.5">
            <button
              type="button"
              aria-label={t("common.close")}
              title={t("common.close")}
              onClick={onClose}
              className="windows95-active-border bg-primary text-text windows95-text flex size-4 cursor-pointer items-center justify-center hover:brightness-110 active:translate-x-px active:translate-y-px"
            >
              <X className="size-2.5" />
            </button>
          </div>
        </section>
        <section className="bg-primary flex w-full flex-1 flex-col gap-1 overflow-y-auto p-2">
          {children}
        </section>
      </div>
    </main>
  );
}

function AniListCharacterDetailModal({
  characterId: initialId,
  characterName: initialName,
  voiceActors: initialVAs,
  onRelated,
  onClose,
}: {
  characterId: number;
  characterName: string;
  voiceActors: AniVoiceActor[];
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
      invoke<AniCharacterMediaEdge[]>("get_character_media", {
        id: currentId,
      }),
  });

  const { data: staffDetail } = useQuery({
    queryKey: ["staff_characters", selectedVa?.id],
    queryFn: () =>
      invoke<AniStaffDetail>("get_staff_characters", {
        id: selectedVa!.id,
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

  const header =
    view === "voiceActor" && selectedVa ? selectedVa.name : currentName;

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
              <span className="windows95-text font-bold">
                {staffDetail.name}
              </span>
            </div>
          </div>

          {staffDetail.characters.length > 0 && (
            <div>
              <span className="windows95-text text-[11px] font-bold">
                {t("anilist.characters.charactersOf", {
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
                    onKeyDown={enterOrSpace(() =>
                      handleCharacterClick(c.id, c.name)
                    )}
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
                      <div className="windows95-active-border flex h-16 w-12 items-center justify-center bg-white text-[8px] font-bold">
                        ?
                      </div>
                    )}
                    <span className="windows95-text w-full truncate text-center text-[7px] leading-tight">
                      {c.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {staffDetail.media.length > 0 && (
            <div>
              <span className="windows95-text text-[11px] font-bold">
                {t("anilist.characters.animeOf", {
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
                      <div className="windows95-active-border flex h-16 w-12 items-center justify-center bg-white text-[8px] font-bold">
                        ?
                      </div>
                    )}
                    <span className="windows95-text w-full truncate text-center text-[7px] leading-tight">
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
              {currentVAs.length > 0 && (
                <div>
                  <span className="windows95-text text-[11px] font-bold">
                    {t("anilist.characters.voiceActors")}
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
                          <div className="windows95-active-border flex h-8 w-8 items-center justify-center bg-white text-[8px] font-bold">
                            ?
                          </div>
                        )}
                        <div className="flex flex-col">
                          <span className="windows95-text text-[10px] leading-tight font-bold">
                            {va.name}
                          </span>
                          {va.native_name && (
                            <span className="windows95-text text-muted text-[8px]">
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
                  <span className="windows95-text text-[11px] font-bold">
                    {t("anilist.characters.appearsIn", { count: media.length })}
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
                          <div className="windows95-active-border flex h-16 w-12 items-center justify-center bg-white text-[8px] font-bold">
                            ?
                          </div>
                        )}
                        <span className="windows95-text w-full truncate text-center text-[7px] leading-tight">
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
