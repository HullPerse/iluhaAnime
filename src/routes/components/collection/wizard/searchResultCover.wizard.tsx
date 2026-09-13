import { useRemoteImage } from "@/hooks/remoteImage.hook";

export function SearchResultCover({ url }: { url: string }) {
  const src = useRemoteImage(url);
  if (!src) return null;
  return <img src={src} alt="" className="size-8 object-cover" />;
}
