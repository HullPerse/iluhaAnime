import type { StreamOpen } from "@/types/player/videoPlayer";
import type { StreamVariant, StreamingEpisode } from "@/types/player/stream";

export type EpisodeResolver = (current: StreamOpen, refresh: boolean) => Promise<StreamOpen | null>;

export interface PlayerStream {
  session: StreamOpen | null;
  variants: StreamVariant[];
  variantsLoading: boolean;
  variantsFailed: boolean;
  switching: boolean;
  switchQuality: (label: string) => Promise<boolean>;
  switchVariant: (variant: StreamVariant) => Promise<boolean>;
  reloadVariants: () => void;
}

export interface PlayerStreamNext {
  failed: boolean;
  retry: () => Promise<void>;
  hasNext: boolean;
  episodes: StreamingEpisode[];
  episodesLoading: boolean;
  goNext: () => Promise<void>;
  goTo: (episode: StreamingEpisode) => Promise<void>;
}
