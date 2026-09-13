import { useRemoteImage } from "@/hooks/remoteImage.hook";

export function FilmstripThumb({ src }: { src: string }) {
  const resolved = useRemoteImage(src);
  if (!resolved) return <span className="h-12 w-20 shrink-0 bg-black/20" />;
  return <img src={resolved} alt="" className="h-12 w-20 object-cover" loading="lazy" />;
}
