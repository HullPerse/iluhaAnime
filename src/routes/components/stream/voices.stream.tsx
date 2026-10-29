import { Mic, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { enterOrSpace } from "@/lib/utils/keyboard.utils";
import type { StreamVariant } from "@/types/stream";

import { StreamInlineLoading } from "./states.stream";

/**
 * Voice-overs of the selected episode. A row is a different Kodik player, not
 * an audio track inside one file, so this list is a stream switch and stays in
 * the player's source panel once playback starts.
 */
export default function StreamVoices({
  variants,
  isPending,
  error,
  selectedId,
  hasEpisode,
  onPick,
  onRetry,
}: {
  variants: StreamVariant[];
  isPending: boolean;
  error: Error | null;
  selectedId: string | null;
  hasEpisode: boolean;
  onPick: (variant: StreamVariant) => void;
  onRetry: () => void;
}) {
  const { t } = useI18n();

  return (
    <section className="windows95-border flex h-64 min-h-0 w-52 shrink-0 flex-col">
      <header className="bg-secondary text-title-text windows95-text flex shrink-0 items-center gap-1 px-1 py-0.5 font-bold">
        <Mic className="size-3" aria-hidden />
        <span>{t("stream.voices")}</span>
        {variants.length > 1 ? (
          <span className="text-hint ml-auto font-normal">{variants.length}</span>
        ) : null}
      </header>

      <div className="bg-field min-h-0 flex-1 overflow-y-auto p-0.5">
        {!hasEpisode ? (
          <span className="text-hint windows95-text block p-2 text-center">
            {t("stream.voices.pick")}
          </span>
        ) : isPending ? (
          <StreamInlineLoading />
        ) : error ? (
          <div className="text-destructive windows95-text flex items-center gap-1 p-1" role="alert">
            <span className="min-w-0 flex-1 break-words">{error.message}</span>
            <Button
              size="icon"
              className="size-5"
              title={t("stream.retry")}
              aria-label={t("stream.retry")}
              onClick={onRetry}
            >
              <RotateCw className="size-3" />
            </Button>
          </div>
        ) : variants.length === 0 ? (
          <span className="text-hint windows95-text block p-2 text-center">
            {t("stream.voices.empty")}
          </span>
        ) : (
          variants.map((variant) => {
            const selected = `${variant.player}:${variant.id}` === selectedId;
            const label = variant.language
              ? `${variant.name}, ${variant.language}`
              : variant.name;
            return (
              <div
                key={`${variant.player}:${variant.id}`}
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                onClick={() => onPick(variant)}
                onKeyDown={enterOrSpace(() => onPick(variant))}
                title={`${variant.player}: ${label}`}
                className={`windows95-text flex w-full cursor-pointer flex-col px-1 py-0.5 text-left select-none ${
                  selected
                    ? "bg-secondary text-title-text font-bold"
                    : "text-text hover:bg-surface"
                }`}
              >
                <span className="min-w-0 truncate">{variant.name}</span>
                <span className="text-hint min-w-0 truncate text-xs font-normal">
                  {[variant.language, variant.player].filter(Boolean).join(", ")}
                </span>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
