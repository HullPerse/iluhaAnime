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

type MediaFileKind = "tv" | "movie" | "special";

type MediaSidecarKind = "audio" | "subs";

interface MediaSidecar {
  kind: MediaSidecarKind;
  studio?: string;
  origin?: string;
  variant?: string;
  lang: string[];
  dub?: boolean;
}

interface MediaEpisode {
  number?: number;
  numberAlt?: number;
  title?: string;
  ofTotal?: number;
  version?: number;
}

export interface MediaFileParse {
  title: string;
  searchTitle: string;
  season?: number;
  part?: number;
  episode: MediaEpisode;
  year?: number;
  kind: MediaFileKind;
  groups: string[];
  lang: string[];
  audio?: string;
  audioLang?: string[];
  subs?: string[];
  source?: string;
  service?: string;
  codec?: string;
  resolution?: string;
  depth?: string;
  crc?: string;
  sequel?: number;
  arc?: string;
  variant?: string;
  special?: string;
  sidecar?: MediaSidecar;
  tags: string[];
  confidence: number;
  type?: string;
  dub?: boolean;
  subVariant?: string;
}
