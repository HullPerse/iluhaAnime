import DitherCanvas from "@/components/shared/dither.component";
import { useCardsImageProxy } from "@/hooks/cards/imageProxy.hook";
import { useRemoteImageStatus } from "@/hooks/remoteImage.hook";
import type { DitherPreset } from "@/types/graphics/dither";

function monogram(title: string): string {
  const parts = title
    .split(/\s+/u)
    .map((part) => part.trim())
    .filter((part) => part !== "");
  const letters = parts.slice(0, 2).map((part) => part[0] ?? "");
  return letters.join("") || "?";
}

export default function StudioCover({
  cover,
  title,
  ditherPreset,
}: {
  cover: string;
  title: string;
  ditherPreset?: DitherPreset;
}) {
  const imageProxy = useCardsImageProxy();
  const { src, failed } = useRemoteImageStatus(cover === "" ? null : cover, imageProxy);
  if (cover === "") {
    return (
      <span className="cards-studio-letter" aria-hidden>
        {monogram(title)}
      </span>
    );
  }
  const imageSrc = src ?? (failed ? cover : null);
  if (imageSrc === null) {
    return (
      <div
        className="bg-surface h-full w-full animate-pulse motion-reduce:animate-none"
        aria-hidden
      />
    );
  }
  if (ditherPreset && ditherPreset.id !== "none") {
    return (
      <DitherCanvas
        src={imageSrc}
        className="h-full w-full"
        capToDisplay
        displayScale={0.6}
        scale={ditherPreset.scale}
        {...ditherPreset.options}
      />
    );
  }
  return <img src={imageSrc} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />;
}
