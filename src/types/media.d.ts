export type FilmstripTab = "frames" | "trailer";

export interface MediaLightboxContentProps {
  stills: string[];
  trailerYoutubeId: string | null;
  trailerLabel: string;
  initialIndex?: number;
  showTrailerInitially?: boolean;
  onTrailerClick?: () => void;
  activeTab?: FilmstripTab;
  hideTabs?: boolean;
}

export interface VideoPlayerProps {
  youtubeId?: string | null;
  webmUrl?: string | null;
  title: string;
  className?: string;
}
