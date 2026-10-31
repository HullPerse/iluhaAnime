import { ChevronLeft, ChevronRight } from "lucide-react";
import type { KeyboardEvent } from "react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { enterOrSpace } from "@/lib/ui/keyboard.utils";

import { FilmstripThumb } from "@/components/shared/filmstrip/thumb.filmstrip";

export function FilmstripStrip({
  stills,
  index,
  showTrailer,
  onSelect,
  onPrev,
  onNext,
}: {
  stills: string[];
  index: number;
  showTrailer: boolean;
  onSelect: (index: number) => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const { t } = useI18n();
  const canStep = stills.length > 1;

  const onStripKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    onSelect(index + (event.key === "ArrowRight" ? 1 : -1));
  };

  return (
    <div className="flex flex-row items-center gap-1">
      <Button
        size="icon"
        className="size-5"
        aria-label={t("common.previous")}
        disabled={!canStep}
        onClick={onPrev}
      >
        <ChevronLeft className="size-3" />
      </Button>
      <div
        role="listbox"
        aria-label={t("common.frames")}
        tabIndex={0}
        onKeyDown={onStripKeyDown}
        className="flex min-w-0 flex-1 flex-row gap-1 overflow-x-auto p-0.5"
      >
        {stills.map((src, i) => {
          const active = i === index && !showTrailer;
          return (
            <button
              key={src}
              type="button"
              role="option"
              aria-selected={active}
              aria-label={`${t("common.frame")} ${i + 1}`}
              onClick={() => onSelect(i)}
              onKeyDown={enterOrSpace(() => onSelect(i))}
              className={
                active
                  ? "windows95-active-border shrink-0 cursor-pointer p-0"
                  : "windows95-border shrink-0 cursor-pointer p-0"
              }
            >
              <FilmstripThumb src={src} />
            </button>
          );
        })}
      </div>
      <Button
        size="icon"
        className="size-5"
        aria-label={t("common.next")}
        disabled={!canStep}
        onClick={onNext}
      >
        <ChevronRight className="size-3" />
      </Button>
    </div>
  );
}
