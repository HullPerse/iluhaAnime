import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { useRemoteImage } from "@/hooks/remoteImage.hook";
import { useI18n } from "@/lib/locale/i18n.utils";
import { enterOrSpace } from "@/lib/utils/keyboard.utils";
import { VideoPlayer } from "@/components/shared/video.component";

function FilmstripThumb({ src }: { src: string }) {
  const resolved = useRemoteImage(src);
  if (!resolved) return <span className="h-12 w-20 shrink-0 bg-black/20" />;
  return <img src={resolved} alt="" className="h-12 w-20 object-cover" loading="lazy" />;
}

export type FilmstripTab = "frames" | "trailer";

/**
 * Design A "film strip": big scene on top, a thumbnail strip below with the
 * active frame highlighted; arrows and keyboard flip frames, the trailer is a
 * tab next to the frames instead of replacing them. Works uncontrolled or
 * controlled (activeTab + onTabChange, hideTabs hides the built-in row when
 * the parent renders its own tabs).
 */
export function FilmstripViewer({
  stills,
  trailerYoutubeId,
  trailerLabel,
  initialIndex = 0,
  showTrailerInitially = false,
  onTrailerClick,
  activeTab,
  onTabChange,
  hideTabs = false,
}: {
  stills: string[];
  trailerYoutubeId: string | null;
  trailerLabel: string;
  initialIndex?: number;
  showTrailerInitially?: boolean;
  onTrailerClick?: () => void;
  activeTab?: FilmstripTab;
  onTabChange?: (tab: FilmstripTab) => void;
  hideTabs?: boolean;
}) {
  const { t } = useI18n();
  const [index, setIndex] = useState(initialIndex);
  const [internalTab, setInternalTab] = useState<FilmstripTab>(
    showTrailerInitially ? "trailer" : "frames"
  );
  const tab = activeTab ?? internalTab;
  const showTrailer = tab === "trailer";
  const setTab = useCallback(
    (next: FilmstripTab) => {
      if (onTabChange) onTabChange(next);
      else setInternalTab(next);
    },
    [onTabChange]
  );
  const total = stills.length;
  const openStill = useCallback(
    (next: number) => {
      setIndex(((next % total) + total) % total);
      setTab("frames");
    },
    [total, setTab]
  );
  const current = total > 0 ? (stills[index] ?? stills[0] ?? "") : "";
  const resolvedCurrent = useRemoteImage(current || null);
  const hasFrames = total > 0;

  useEffect(() => {
    setIndex((prev) => ((prev % total) + total) % total);
  }, [total]);

  const onStripKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      openStill(index + (event.key === "ArrowRight" ? 1 : -1));
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-row items-center gap-1">
        {!hideTabs && (
          <>
            <Button
              className="h-5 px-1 text-xs"
              aria-pressed={!showTrailer}
              onClick={() => setTab("frames")}
            >
              {t("common.frames")}
            </Button>
            {trailerYoutubeId ? (
              <Button
                className="h-5 px-1 text-xs"
                aria-pressed={showTrailer}
                onClick={() => {
                  if (onTrailerClick) {
                    onTrailerClick();
                  } else {
                    setTab("trailer");
                  }
                }}
              >
                {trailerLabel}
              </Button>
            ) : null}
          </>
        )}
        <span className="windows95-text ml-auto text-xs">
          {showTrailer ? "▶" : `${hasFrames ? index + 1 : 0}/${total}`}
        </span>
      </div>
      {showTrailer && trailerYoutubeId ? (
        <VideoPlayer
          youtubeId={trailerYoutubeId}
          title={trailerLabel}
          className="aspect-video w-full"
        />
      ) : hasFrames ? (
        <div
          role="group"
          aria-label={t("common.frames")}
          className="windows95-border min-h-0 bg-black"
        >
          <ImageComponent
            key={current}
            src={resolvedCurrent ?? current}
            alt=""
            type="contain"
            className="aspect-video w-full bg-black"
          />
        </div>
      ) : (
        <div className="windows95-border flex aspect-video w-full items-center justify-center bg-black">
          <span className="windows95-text text-hint text-xs">{t("common.no.results")}</span>
        </div>
      )}
      <div className="flex flex-row items-center gap-1">
        <Button
          size="icon"
          className="size-5"
          aria-label={t("common.previous")}
          disabled={!hasFrames || total < 2}
          onClick={() => openStill(index - 1)}
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
                onClick={() => openStill(i)}
                onKeyDown={enterOrSpace(() => openStill(i))}
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
          disabled={!hasFrames || total < 2}
          onClick={() => openStill(index + 1)}
        >
          <ChevronRight className="size-3" />
        </Button>
      </div>
    </div>
  );
}
