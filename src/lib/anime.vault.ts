import type { TranslationKey } from "@/lib/i18n";
import type {
  VaultHealthReport,
  VaultIssue,
  VaultMediaFile,
  VaultOrganizationPlan,
  VaultEpisodeMatrixRow,
  VaultStoredMediaRecord,
} from "@/types";
import type { TranslationVariables } from "@/types/i18n";

const VIDEO_EXTENSIONS = new Set([
  "mkv",
  "mp4",
  "m4v",
  "avi",
  "mov",
  "webm",
  "ts",
  "m2ts",
  "ogv",
]);
const QUALITY_RE =
  /(?:^|[\s._\-[\]()])(2160p|1440p|1080p|720p|576p|480p|4k|8k)(?:$|[\s._\-[\]()])/i;
const CODEC_RE =
  /(?:^|[\s._\-[\]])(x26[45]|h[ ._-]?26[45]|av1|hevc|vp9|avc)(?:$|[\s._\-[\]])/i;

type VaultIssueFormatter = (
  key: TranslationKey,
  variables?: TranslationVariables
) => string;

function withoutExtension(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

function normalizeTitle(value: string): string {
  return value
    .replaceAll(/[._]+/g, " ")
    .replaceAll(/\[[^\]]*\]|\([^)]*\)/g, " ")
    .replace(/\b(?:S\d{1,2}E\d{1,4}|\d{1,2}x\d{1,4}|E\d{1,4})\b.*$/i, "")
    .replaceAll(/\s+/g, " ")
    .replace(/[\s-]+$/, "")
    .trim();
}

export function parseVaultFilename(
  name: string
): Pick<VaultMediaFile, "title" | "season" | "episode" | "quality" | "codec"> {
  const stem = withoutExtension(name);
  const seasonEpisode = stem.match(/S(\d{1,2})E(\d{1,4})/i);
  const altEpisode = stem.match(
    /(?:^|[\s._\-[\]])E?(\d{1,4})(?:$|[\s._\-[\]])/i
  );
  const season = seasonEpisode ? Number(seasonEpisode[1]) : 1;
  const episode = seasonEpisode
    ? Number(seasonEpisode[2])
    : altEpisode
      ? Number(altEpisode[1])
      : null;
  const quality = stem.match(QUALITY_RE)?.[1] ?? null;
  const codec =
    stem
      .match(CODEC_RE)?.[1]
      ?.replaceAll(/[ ._-]/g, "")
      .toLowerCase() ?? null;
  return { codec, episode, quality, season, title: normalizeTitle(stem) };
}

function vaultEpisodeKey(
  parsed: Pick<VaultMediaFile, "title" | "season" | "episode">
): string {
  return `${parsed.title.toLowerCase()}|${parsed.season}|${parsed.episode ?? "unknown"}`;
}

function toVaultMediaFile(
  entry: { path: string; name: string; size: number },
  subtitleNames = new Set<string>()
): VaultMediaFile {
  const parsed = parseVaultFilename(entry.name);
  const stem = withoutExtension(entry.name).toLowerCase();
  return {
    ...entry,
    ...parsed,
    subtitleLikely:
      subtitleNames.has(vaultEpisodeKey(parsed)) ||
      /(?:\bsub(?:s|title)?\b|\beng\b|\bru\b)/i.test(stem),
  };
}

export function restoreVaultEntries(
  records: VaultStoredMediaRecord[]
): { path: string; name: string; size: number }[] {
  return records.flatMap((record) => {
    const name =
      typeof record.metadata?.name === "string" ? record.metadata.name : null;
    const size =
      typeof record.metadata?.size === "number" ? record.metadata.size : null;
    if (
      !record.path ||
      !name ||
      size == null ||
      !Number.isFinite(size) ||
      size < 0
    )
      return [];
    return [{ name, path: record.path, size }];
  });
}

function collectSubtitleNames(entries: { name: string }[]): Set<string> {
  return new Set(
    entries
      .filter((entry) => /\.(?:ass|ssa|srt|vtt|sup|sub)$/i.test(entry.name))
      .map((entry) => vaultEpisodeKey(parseVaultFilename(entry.name)))
  );
}

function collectEpisodeGroups(files: VaultMediaFile[]): Map<string, VaultMediaFile[]> {
  const groups = new Map<string, VaultMediaFile[]>();
  for (const file of files) {
    const key = `${file.title.toLowerCase()}|${file.season}|${file.episode ?? "unknown"}`;
    const group = groups.get(key) ?? [];
    group.push(file);
    groups.set(key, group);
  }
  return groups;
}

function buildVaultIssues(
  files: VaultMediaFile[],
  formatIssue?: VaultIssueFormatter
): { issues: VaultIssue[]; reclaimableBytes: number } {
  const issues: VaultIssue[] = files
    .filter((file) => !file.subtitleLikely)
    .map((file) => ({
      kind: "subtitle" as const,
      message: formatIssue?.("vault.issue.noSubtitle", { name: file.name }) ?? `No matching subtitle detected for ${file.name}`,
      paths: [file.path],
      severity: "warning" as const,
    }));
  let reclaimableBytes = 0;
  for (const [key, group] of collectEpisodeGroups(files)) {
    if (group.length < 2) continue;
    const ordered = [...group].sort((a, b) => b.size - a.size);
    const duplicates = ordered.slice(1);
    reclaimableBytes += duplicates.reduce((sum, file) => sum + file.size, 0);
    issues.push({
      kind: "duplicate",
      message: formatIssue?.("vault.issue.duplicate", { key }) ?? `Duplicate episode candidate: ${key}`,
      paths: duplicates.map((file) => file.path),
      severity: "warning",
    });
  }
  const seasons = new Map<string, Set<number>>();
  for (const file of files) {
    if (file.episode == null) continue;
    const key = `${file.title.toLowerCase()}|${file.season}`;
    const episodes = seasons.get(key) ?? new Set<number>();
    episodes.add(file.episode);
    seasons.set(key, episodes);
  }
  for (const [key, episodes] of seasons) {
    const missing = Array.from({ length: Math.max(...episodes) }, (_, i) => i + 1).filter((episode) => !episodes.has(episode));
    if (missing.length === 0) continue;
    issues.push({
      kind: "missing",
      message: formatIssue?.("vault.issue.missing", { episodes: missing.join(", "), key }) ?? `${key}: missing episodes ${missing.join(", ")}`,
      paths: [],
      severity: "warning",
    });
  }
  return { issues, reclaimableBytes };
}

export function buildVaultHealthReport(
  entries: { path: string; name: string; size: number }[],
  formatIssue?: VaultIssueFormatter
): VaultHealthReport {
  const subtitleNames = collectSubtitleNames(entries);
  const files = entries
    .filter((entry) => VIDEO_EXTENSIONS.has(entry.name.split(".").pop()?.toLowerCase() ?? ""))
    .map((entry) => toVaultMediaFile(entry, subtitleNames));
  const { issues, reclaimableBytes } = buildVaultIssues(files, formatIssue);
  return {
    files,
    issues,
    okCount: Math.max(0, files.length - issues.filter((issue) => issue.kind !== "subtitle").length),
    reclaimableBytes,
    totalBytes: files.reduce((sum, file) => sum + file.size, 0),
  };
}

function qualityScore(quality: string | null): number {
  if (!quality) return 0;
  const normalized = quality.toLowerCase();
  if (normalized === "8k") return 8000;
  if (normalized === "4k") return 4000;
  return Number.parseInt(normalized, 10) || 0;
}

function releaseScore(file: VaultMediaFile): number {
  const codecScore =
    file.codec === "av1"
      ? 3
      : file.codec === "hevc" || file.codec === "x265"
        ? 2
        : 1;
  return (
    qualityScore(file.quality) * 10 +
    codecScore +
    (file.subtitleLikely ? 0.5 : 0)
  );
}

/**
 * Creates a stable episode matrix from the same normalized files used by the
 * health report. The first release is the best local candidate, not a claim
 * about objective visual quality; later release analysis can refine it.
 */
export function buildVaultEpisodeMatrix(
  files: VaultMediaFile[]
): VaultEpisodeMatrixRow[] {
  const grouped = new Map<string, VaultMediaFile[]>();
  for (const file of files) {
    if (file.episode == null) continue;
    const key = `${file.title.toLowerCase()}|${file.season}|${file.episode}`;
    const releases = grouped.get(key) ?? [];
    releases.push(file);
    grouped.set(key, releases);
  }
  return [...grouped.entries()]
    .map(([key, releases]) => {
      const ordered = [...releases].sort((left, right) => {
        const score = releaseScore(right) - releaseScore(left);
        return (
          score || right.size - left.size || left.path.localeCompare(right.path)
        );
      });
      const bestRelease = ordered[0];
      return {
        bestRelease,
        duplicateCount: Math.max(0, ordered.length - 1),
        episode: bestRelease.episode as number,
        hasSubtitle: ordered.some((file) => file.subtitleLikely),
        key,
        releases: ordered,
        season: bestRelease.season,
        title: bestRelease.title,
      };
    })
    .sort(
      (left, right) =>
        left.title.localeCompare(right.title) ||
        left.season - right.season ||
        left.episode - right.episode
    );
}

export function buildOrganizationPreview(
  files: VaultMediaFile[],
  root: string
): VaultOrganizationPlan[] {
  return files.map((file) => {
    const safeTitle = file.title || "Unknown Anime";
    const season = `Season ${String(file.season).padStart(2, "0")}`;
    const episode =
      file.episode == null
        ? null
        : `S${String(file.season).padStart(2, "0")}E${String(file.episode).padStart(2, "0")}`;
    const extension = file.name.includes(".")
      ? `.${file.name.split(".").pop()}`
      : "";
    const targetPath = `${root.replace(/[\\/]$/, "")}/Anime/${safeTitle}/${season}/${episode ?? file.name}${episode ? extension : ""}`;
    return {
      action: file.episode == null ? "review" : "move",
      episode: file.episode,
      season: file.season,
      sourcePath: file.path,
      targetPath,
      title: safeTitle,
    };
  });
}

export function formatVaultBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024))
  );
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}
