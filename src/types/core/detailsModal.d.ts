import type { DetailsTab } from "@/types/core/panels.details";
import type { TorrentDetailField, TorrentView } from "@/types/torrent/torrent";

export interface ImageLightbox {
  images: string[];
  index: number;
}

export interface DetailsTabPanelsProps {
  view: TorrentView;
  activeTab: DetailsTab;
  metadataFields: TorrentDetailField[];
  onZoom: (url: string) => void;
  onZoomScreenshot: (url: string) => void;
}
