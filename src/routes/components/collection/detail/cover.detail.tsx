import Image from "@/components/ui/image.component";
import { useCoverCache } from "@/hooks/collection/cache.hook";
import { useRemoteImage } from "@/hooks/remoteImage.hook";
import { generatePlaceholder } from "@/lib/collection/placeholder.utils";
import { useSettingsStore } from "@/store/settings.store";
import type { CollectionItem } from "@/types/collection";

export function DetailCoverCollection({ item }: { item: CollectionItem }) {
  const blobId = item.thumbBlobId ?? item.coverBlobId;
  const { cachedUrl } = useCoverCache(item.coverUrl, blobId);
  const tmdbProxyUrl = useSettingsStore((s) => s.tmdbProxyUrl);
  const remoteSrc = useRemoteImage(blobId != null ? null : (item.coverUrl ?? null));
  const direct = tmdbProxyUrl ? null : (item.coverUrl ?? null);
  const cover = cachedUrl ?? remoteSrc ?? direct ?? generatePlaceholder(item.title);
  return (
    <section className="windows95-border shrink-0 self-start bg-white">
      <Image src={cover} alt={item.title} width={144} height={216} className="block h-54 w-36" />
    </section>
  );
}
