import { useCardsImageProxy } from "@/hooks/cards/imageProxy.hook";
import { useRemoteImageStatus } from "@/hooks/remoteImage.hook";

function monogram(title: string): string {
  const parts = title
    .split(/\s+/u)
    .map((part) => part.trim())
    .filter((part) => part !== "");
  const letters = parts.slice(0, 2).map((part) => part[0] ?? "");
  return letters.join("") || "?";
}

export default function StudioCover({ cover, title }: { cover: string; title: string }) {
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
  return <img src={imageSrc} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />;
}
