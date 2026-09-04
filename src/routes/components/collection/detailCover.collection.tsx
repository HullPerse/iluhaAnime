import { useCoverCache } from "@/hooks/coverCache.hook";

export function DetailCoverCollection({ url }: { url: string }) {
  const { cachedUrl } = useCoverCache(url);
  return <img src={cachedUrl ?? url} alt="" className="windows95-border h-48 w-32 object-cover" />;
}
