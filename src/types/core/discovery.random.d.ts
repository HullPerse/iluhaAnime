import type { AniMedia } from "@/types/anilist/anilist";
import type { EntryListInfo } from "@/types/anilist/entries";

export interface DiscoveryCardProps {
  item: DiscoveryItem;
  nav: DiscoveryNav;
}

interface DiscoveryItem {
  media: AniMedia;
  entry?: EntryListInfo;
}
