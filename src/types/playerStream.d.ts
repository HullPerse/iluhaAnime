import type { StreamOpen } from "@/types/videoPlayer";
import type { StreamVariant, StreamingEpisode } from "@/types/stream";

export interface PlayerStream {
  session: StreamOpen | null;
  /** The other voice-overs of the current episode, loaded on first open. */
  variants: StreamVariant[];
  variantsLoading: boolean;
  variantsFailed: boolean;
  switching: boolean;
  /** False when another switch is running or the choice could not be opened. */
  switchQuality: (label: string) => Promise<boolean>;
  switchVariant: (variant: StreamVariant) => Promise<boolean>;
  reloadVariants: () => void;
}

export interface PlayerStreamNext {
  hasNext: boolean;
  /** The season of the session's title, for the episode list. */
  episodes: StreamingEpisode[];
  episodesLoading: boolean;
  goNext: () => Promise<void>;
  goTo: (episode: StreamingEpisode) => Promise<void>;
}
