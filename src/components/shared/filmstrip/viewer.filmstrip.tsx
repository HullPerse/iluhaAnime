import { useCallback, useEffect, useState } from "react";

import { VideoPlayer } from "@/components/shared/video/player.video";
import ImageComponent from "@/components/ui/image.component";
import { useI18n } from "@/hooks/i18n.hook";
import { useRemoteImage } from "@/hooks/remoteImage.hook";
import type { FilmstripTab } from "@/types/player/media";

import { FilmstripStrip } from "@/components/shared/filmstrip/strip.filmstrip";
import { FilmstripTabs } from "@/components/shared/filmstrip/tabs.filmstrip";

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
  const [index, setIndex] = useState<number>(initialIndex);
  const [internalTab, setInternalTab] = useState<FilmstripTab>(
    showTrailerInitially ? "trailer" : "frames"
  );
  const tab = activeTab ?? internalTab;
  const showTrailer = tab === "trailer";
  const total = stills.length;

  const setTab = useCallback(
    (next: FilmstripTab) => {
      if (onTabChange) onTabChange(next);
      else setInternalTab(next);
    },
    [onTabChange]
  );
  const openStill = useCallback(
    (next: number) => {
      setIndex(((next % total) + total) % total);
      setTab("frames");
    },
    [total, setTab]
  );

  const current = total > 0 ? (stills.at(index) ?? stills.at(0) ?? "") : "";
  const resolvedCurrent = useRemoteImage(current || null);
  const hasFrames = total > 0;

  useEffect(() => {
    setIndex((prev) => ((prev % total) + total) % total);
  }, [total]);

  const openTrailer = () => {
    if (onTrailerClick) {
      onTrailerClick();
      return;
    }
    setTab("trailer");
  };

  return (
    <div className="flex flex-col gap-1">
      <FilmstripTabs
        hideTabs={hideTabs}
        showTrailer={showTrailer}
        trailerYoutubeId={trailerYoutubeId}
        trailerLabel={trailerLabel}
        index={index}
        total={total}
        onFrames={() => setTab("frames")}
        onTrailer={openTrailer}
      />
      {showTrailer && trailerYoutubeId && (
        <VideoPlayer
          youtubeId={trailerYoutubeId}
          title={trailerLabel}
          className="aspect-video w-full"
        />
      )}
      {!showTrailer && hasFrames && (
        <div
          role="group"
          aria-label={t("common.frames")}
          className="windows95-border min-h-0 bg-black"
        >
          <ImageComponent
            key={current}
            src={resolvedCurrent ?? ""}
            alt=""
            type="contain"
            className="aspect-video w-full bg-black"
          />
        </div>
      )}
      {!showTrailer && !hasFrames && (
        <div className="windows95-border flex aspect-video w-full items-center justify-center bg-black">
          <span className="windows95-text text-hint text-xs">{t("common.no.results")}</span>
        </div>
      )}
      <FilmstripStrip
        stills={stills}
        index={index}
        showTrailer={showTrailer}
        onSelect={openStill}
        onPrev={() => openStill(index - 1)}
        onNext={() => openStill(index + 1)}
      />
    </div>
  );
}
