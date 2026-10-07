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

export type MediaFileKind = "tv" | "movie" | "special";

export type MediaSidecarKind = "audio" | "subs";

export interface MediaSidecar {
  kind: MediaSidecarKind;
  studio?: string;
  origin?: string;
  variant?: string;
  lang: string[];
  dub?: boolean;
}

export interface MediaEpisode {
  number?: number;
  numberAlt?: number;
  title?: string;
  ofTotal?: number;
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

export type MediaTokenEnclosed = "bracket" | "paren" | "plain";

export interface MediaNameToken {
  value: string;
  enclosed: MediaTokenEnclosed;
}

export type MediaTokenKind =
  | "group"
  | "studio"
  | "service"
  | "source"
  | "lang"
  | "codec"
  | "resolution"
  | "depth"
  | "audio"
  | "subs"
  | "dub"
  | "season"
  | "part"
  | "episode"
  | "seasonEpisode"
  | "year"
  | "crc"
  | "special"
  | "type"
  | "tag"
  | "title"
  | "unknown";

export interface MediaClassifiedToken extends MediaNameToken {
  kind: MediaTokenKind;
  bracketGroup?: number;
}

export interface FieldBag {
  groups: string[];
  langs: string[];
  type?: string;
  dub: boolean;
  special?: string;
  source?: string;
  service?: string;
  codec?: string;
  resolution?: string;
  depth?: string;
  audio?: string;
  subs: string[];
  subVariant?: string;
  crc?: string;
  year?: number;
  tags: string[];
  season?: number;
  variant?: string;
}

export interface DirContext {
  titleWords: string[];
  season?: number;
  year?: number;
  source?: string;
  service?: string;
  codec?: string;
  resolution?: string;
  groups: string[];
  langs: string[];
  hasMovieRoot: boolean;
  hasSpecial: boolean;
}

export interface SeasonHit {
  season: number;
  variant?: string;
  consumed: Set<number>;
}

export interface PartHit {
  part?: number;
  consumed: Set<number>;
}

export interface EpisodeHit {
  number?: number;
  numberAlt?: number;
  ofTotal?: number;
  atomIndex: number;
  fallbackIndex: number;
  consumed: Set<number>;
}
