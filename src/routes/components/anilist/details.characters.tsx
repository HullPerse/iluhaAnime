import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useQuery } from "@tanstack/react-query";
import { useSettingsStore } from "@/store/settings.store";
import { cn } from "@/lib/index.utils";
import { ChevronLeft, Monitor, X, Loader } from "lucide-react";
import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
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
          "relative flex flex-col min-w-lg max-w-[80%] w-fit min-h-42 h-fit max-h-[80%] bg-primary windows95-active-border",
          modalAnimation ? "transition-opacity duration-150" : "",
          visible ? "opacity-100" : "opacity-0",
          enable3dBorders ? "windows95-3d-border" : "",
        )}
      >
        <section className="flex flex-row items-center justify-between bg-secondary w-full p-1">
          <div className="flex flex-row items-center gap-1 min-w-0">
            {onBack && (
              <Button onClick={onBack} size="icon" className="size-4">
                <ChevronLeft className="size-2.5" />
              </Button>
            )}
            <Monitor className="size-3 shrink-0 text-white" />
            <span className="text-white windows95-text font-bold line-clamp-1">
              {header}
            </span>
          </div>
          <div className="flex flex-row items-center gap-0.5 shrink-0">
            <button
              onClick={onClose}
              className="size-4 flex items-center justify-center windows95-active-border bg-primary text-text windows95-text cursor-pointer hover:brightness-110 active:translate-x-px active:translate-y-px"
            >
              <X className="size-2.5" />
            </button>
          </div>
        </section>
        <section className="flex flex-col gap-1 p-2 overflow-y-auto flex-1 w-full bg-primary">
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
          <div className="flex flex-row gap-3 items-start">
            {staffDetail.image && (
              <ImageComponent
                src={staffDetail.image}
                alt=""
                className="w-20 h-28 object-cover windows95-active-border shrink-0"
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
              <span className="windows95-text font-bold text-[11px]">
                Персонажи ({staffDetail.characters.length})
              </span>
              <div className="flex flex-wrap gap-1 mt-1">
                {staffDetail.characters.map((c) => (
                  <div
                    key={c.id}
                    role="button"
                    onClick={() => handleCharacterClick(c.id, c.name)}
                    className="flex flex-col items-center gap-0.5 p-0.5 w-14 cursor-pointer hover:bg-surface"
                    title={c.name}
                  >
                    {c.image ? (
                      <ImageComponent
                        src={c.image}
                        alt=""
                        className="h-16 w-12 object-cover windows95-active-border"
                      />
                    ) : (
                      <div className="w-12 h-16 windows95-active-border bg-white flex items-center justify-center text-[8px] font-bold">
                        ?
                      </div>
                    )}
                    <span className="text-[7px] windows95-text truncate w-full text-center leading-tight">
                      {c.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {staffDetail.media.length > 0 && (
            <div>
              <span className="windows95-text font-bold text-[11px]">
                Аниме ({staffDetail.media.length})
              </span>
              <div className="flex flex-wrap gap-1 mt-1">
                {staffDetail.media.map((m) => (
                  <div
                    key={m.id}
                    role="button"
                    onClick={() => onRelated?.(m.id)}
                    className="flex flex-col items-center gap-0.5 p-0.5 w-14 cursor-pointer hover:bg-surface"
                    title={m.title}
                  >
                    {m.cover_url ? (
                      <ImageComponent
                        src={m.cover_url}
                        alt=""
                        className="h-16 w-12 object-cover windows95-active-border"
                      />
                    ) : (
                      <div className="w-12 h-16 windows95-active-border bg-white flex items-center justify-center text-[8px] font-bold">
                        ?
                      </div>
                    )}
                    <span className="text-[7px] windows95-text truncate w-full text-center leading-tight">
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
              <Loader className="size-5 animate-spin windows95-text" />
            </div>
          ) : (
            <>
              {currentVAs.length > 0 && (
                <div>
                  <span className="windows95-text font-bold text-[11px]">
                    Сэйю
                  </span>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {currentVAs.map((va) => (
                      <div
                        key={va.id}
                        role="button"
                        onClick={() => handleVaClick(va)}
                        className="w-42 flex flex-row items-center gap-2 p-1 windows95-active-border bg-primary hover:bg-surface cursor-pointer"
                      >
                        {va.image ? (
                          <ImageComponent
                            src={va.image}
                            alt=""
                            className="w-13 h-18 object-cover windows95-active-border shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 windows95-active-border bg-white flex items-center justify-center text-[8px] font-bold">
                            ?
                          </div>
                        )}
                        <div className="flex flex-col">
                          <span className="windows95-text text-[10px] font-bold leading-tight">
                            {va.name}
                          </span>
                          {va.native_name && (
                            <span className="text-[8px] windows95-text text-muted">
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
                  <span className="windows95-text font-bold text-[11px]">
                    Появляется в ({media.length})
                  </span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {media.map((m) => (
                      <div
                        key={m.id}
                        role="button"
                        onClick={() => onRelated?.(m.id)}
                        className="flex flex-col items-center gap-0.5 p-0.5 w-14 cursor-pointer hover:bg-surface"
                        title={m.title}
                      >
                        {m.cover_url ? (
                          <ImageComponent
                            src={m.cover_url}
                            alt=""
                            className="h-16 w-12 object-cover windows95-active-border"
                          />
                        ) : (
                          <div className="w-12 h-16 windows95-active-border bg-white flex items-center justify-center text-[8px] font-bold">
                            ?
                          </div>
                        )}
                        <span className="text-[7px] windows95-text truncate w-full text-center leading-tight">
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
