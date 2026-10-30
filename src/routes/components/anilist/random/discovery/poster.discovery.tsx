import ImageComponent from "@/components/ui/image.component";
import { useRemoteImage } from "@/hooks/remoteImage.hook";
import type { AniMedia } from "@/types/anilist/anilist";

export function Poster({ media }: { media: AniMedia }) {
  const coverSrc = useRemoteImage(media.cover_url);
  return (
    <ImageComponent
      src={coverSrc ?? "/images/unknown_source.png"}
      alt={media.title}
      className="block h-54 w-36"
    />
  );
}
