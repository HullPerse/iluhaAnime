export interface VaultMediaFile {
  path: string;
  name: string;
  size: number;
  title: string;
  season: number;
  episode: number | null;
  quality: string | null;
  codec: string | null;
  subtitleLikely: boolean;
}

export interface VaultIssue {
  kind:
    | "missing"
    | "duplicate"
    | "inconsistent"
    | "corrupt"
    | "wrong-episode"
    | "subtitle";
  severity: "warning" | "error";
  message: string;
  paths: string[];
}

export interface VaultHealthReport {
  files: VaultMediaFile[];
  issues: VaultIssue[];
  okCount: number;
  totalBytes: number;
  reclaimableBytes: number;
}

export interface VaultEpisodeMatrixRow {
  key: string;
  title: string;
  season: number;
  episode: number;
  releases: VaultMediaFile[];
  bestRelease: VaultMediaFile;
  duplicateCount: number;
  hasSubtitle: boolean;
}

export interface VaultStoredMediaRecord {
  path: string;
  identity: {
    title?: unknown;
    season?: unknown;
    episode?: unknown;
    quality?: unknown;
    codec?: unknown;
    subtitleLikely?: unknown;
  };
  metadata: { name?: unknown; size?: unknown };
  scannedAt: number;
}

export interface VaultOrganizationPlan {
  sourcePath: string;
  targetPath: string;
  title: string;
  season: number;
  episode: number | null;
  action: "move" | "review" | "skip";
}

export interface VaultMetadata {
  title: string;
  anilistId: number | null;
  aliases: string[];
  coverUrl: string | null;
  updatedAt: number;
}
