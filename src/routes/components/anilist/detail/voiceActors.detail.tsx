import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { AniVoiceActor } from "@/types/anilist";

export function VoiceActorsPreview({
  voiceActors,
  onSelect,
}: {
  voiceActors: AniVoiceActor[];
  onSelect?: (voiceActor: AniVoiceActor) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-1">
      <span className="windows95-text text-title-text bg-secondary px-1">
        {t("anilist.characters.voice.actors")}
      </span>
      {voiceActors.map((voiceActor) => {
        const row = (
          <>
            <span className="windows95-border bg-field flex size-10 shrink-0 overflow-hidden">
              <ImageComponent
                src={voiceActor.image ?? ""}
                alt={voiceActor.name}
                className="h-full w-full"
              />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="windows95-text text-xs font-bold break-words">
                {voiceActor.name}
              </span>
              {voiceActor.native_name != null && voiceActor.native_name !== "" && (
                <span className="windows95-text text-hint text-xs">{voiceActor.native_name}</span>
              )}
            </span>
          </>
        );
        if (!onSelect) {
          return (
            <div key={voiceActor.id} className="flex flex-row items-center gap-1">
              {row}
            </div>
          );
        }
        return (
          <Button
            key={voiceActor.id}
            variant="ghost"
            aria-label={voiceActor.name}
            className="flex w-full min-w-0 flex-row items-center justify-start gap-1 p-0.5 text-left"
            onClick={() => onSelect(voiceActor)}
          >
            {row}
          </Button>
        );
      })}
    </div>
  );
}
