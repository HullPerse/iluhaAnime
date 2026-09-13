import ImageComponent from "@/components/ui/image.component";
import { useRemoteImage } from "@/hooks/remoteImage.hook";

export function SimilarCover({ url }: { url: string }) {
  const src = useRemoteImage(url);
  if (!src) return null;
  return (
    <ImageComponent
      src={src}
      alt="cover_url"
      className="windows95-active-border h-18 w-13 shrink-0"
    />
  );
}
