import Image from "@/components/ui/image.component";
import { useCoverCache } from "@/hooks/collection/cache.hook";
import { useRemoteImage } from "@/hooks/remoteImage.hook";
import { generatePlaceholder } from "@/lib/collection/placeholder.utils";
import type { CollectionItem } from "@/types/collection";

export function DetailCoverCollection({ item }: { item: CollectionItem }) {
  const blobId = item.thumbBlobId ?? item.coverBlobId;
  const { cachedUrl } = useCoverCache(item.coverUrl, blobId);
  const remoteSrc = useRemoteImage(blobId != null ? null : (item.coverUrl ?? null));
  const cover = cachedUrl ?? remoteSrc ?? generatePlaceholder(item.title);
  return (
    <section className="windows95-border bg-field shrink-0 self-start">
      <Image src={cover} alt={item.title} width={144} height={216} className="block h-54 w-36" />
    </section>
  );
}
