import type { AniMedia } from "@/types/anilist";
import type { EntryListInfo } from "@/types/entries";

export interface DiscoveryCardProps {
  item: DiscoveryItem;
  nav: DiscoveryNav;
}

interface DiscoveryItem {
  media: AniMedia;
  entry?: EntryListInfo;
}
