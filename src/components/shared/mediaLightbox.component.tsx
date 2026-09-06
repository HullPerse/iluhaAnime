import { useState } from "react";

import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";

export function MediaLightbox({
  title,
  stills,
  trailerYoutubeId,
  trailerLabel,
  counterLabel,
  emptyLabel,
  initialIndex = 0,
  startWithTrailer = false,
  onClose,
}: {
  title: string;
  stills: string[];
  trailerYoutubeId: string | null;
  trailerLabel: string;
  counterLabel: (index: number, total: number) => string;
  emptyLabel: string;
  initialIndex?: number;
  startWithTrailer?: boolean;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const [showTrailer, setShowTrailer] = useState(startWithTrailer);
  const current = stills.length > 0 ? (stills[index % stills.length] ?? "") : "";
  return (
    <Modal header={title} onClose={onClose}>
      {showTrailer && trailerYoutubeId ? (
        <iframe
          title={trailerLabel}
          src={`https://www.youtube-nocookie.com/embed/${trailerYoutubeId}`}
          className="h-64 w-96 max-w-full"
          sandbox="allow-scripts allow-presentation"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : stills.length === 0 ? (
        <span className="windows95-text text-hint text-xs">{emptyLabel}</span>
      ) : (
        <div className="flex flex-col gap-1">
          <ImageComponent
            src={current}
            alt=""
            className="h-64 w-96 max-w-full bg-black object-contain"
          />
          <div className="flex flex-row items-center gap-1">
            <Button
              className="h-5 px-1 text-xs"
              disabled={stills.length < 2}
              onClick={() => setIndex((i) => (i - 1 + stills.length) % stills.length)}
            >
              ←
            </Button>
            <span className="windows95-text text-xs">
              {counterLabel(stills.length > 0 ? (index % stills.length) + 1 : 0, stills.length)}
            </span>
            <Button
              className="h-5 px-1 text-xs"
              disabled={stills.length < 2}
              onClick={() => setIndex((i) => (i + 1) % stills.length)}
            >
              →
            </Button>
            {trailerYoutubeId ? (
              <Button className="ml-auto h-5 px-1 text-xs" onClick={() => setShowTrailer(true)}>
                {trailerLabel}
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </Modal>
  );
}
