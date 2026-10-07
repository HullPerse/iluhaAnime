import { torrentApi } from "@/api/torrent.api";
import { attempt } from "@/lib/utils/attempt.utils";
import { showError, showInfo } from "@/lib/utils/notification.utils";
import { tr } from "@/lib/locale/i18n.utils";
import type {
  TorrentDetailFile,
  TorrentDetails,
  TorrentFileInfo,
  TorrentInfo,
  TorrentOrigin,
} from "@/types/torrent";

export const UPDATE_SOURCES_WITH_FILES = new Set(["rutracker", "nyaa", "sukebei", "erai-raws"]);

export function normalizeUpdateFileName(name: string): string {
  return name.replace(/\\/g, "/").replace(/\s+/g, " ").trim().toLowerCase();
}

export function findUpdatedFiles(
  torrentFiles: TorrentFileInfo[],
  detailFiles: TorrentDetailFile[]
): TorrentDetailFile[] {
  const known = new Set(torrentFiles.map((file) => normalizeUpdateFileName(file.name)));
  const knownBase = new Set(
    torrentFiles.map((file) => {
      const normalized = normalizeUpdateFileName(file.name);
      return normalized.slice(normalized.lastIndexOf("/") + 1);
    })
  );
  return detailFiles.filter((file) => {
    const normalized = normalizeUpdateFileName(file.name);
    if (!normalized || known.has(normalized)) return false;
    const base = normalized.slice(normalized.lastIndexOf("/") + 1);
    return !knownBase.has(base);
  });
}

function parseRutrackerTopicId(url: string): string | null {
  const match = url.match(/[?&]t=(\d+)/);
  return match ? match[1] : null;
}

async function fetchFreshTorrentBytes(
  origin: TorrentOrigin,
  details: TorrentDetails
): Promise<{ ok: true; bytes: number[] } | { ok: false; error: string }> {
  if (origin.source === "rutracker") {
    const topicId = parseRutrackerTopicId(origin.url);
    if (!topicId) return { ok: false, error: tr("torrent.files.update.bad.url") };
    const [bytes, error] = await attempt(torrentApi.rutrackerGetTorrentBytes(topicId));
    if (error || !bytes || bytes.length === 0)
      return { ok: false, error: error?.message ?? tr("torrent.files.update.bytes.error") };
    return { ok: true, bytes };
  }
  const torrentUrl = details.torrentUrl || details.magnet;
  if (!torrentUrl.startsWith("http")) return { ok: false, error: tr("torrent.files.update.no.url") };
  const [bytes, error] = await attempt(torrentApi.fetchTorrentBytes(torrentUrl, origin.source));
  if (error || !bytes || bytes.length === 0)
    return { ok: false, error: error?.message ?? tr("torrent.files.update.bytes.error") };
  return { ok: true, bytes };
}

function matchPickedIndices(
  picked: TorrentDetailFile[],
  freshFiles: TorrentFileInfo[]
): number[] {
  const byFull = new Map(freshFiles.map((file) => [normalizeUpdateFileName(file.name), file.index]));
  const byBase = new Map(
    freshFiles.map((file) => {
      const normalized = normalizeUpdateFileName(file.name);
      return [normalized.slice(normalized.lastIndexOf("/") + 1), file.index];
    })
  );
  const indices: number[] = [];
  for (const file of picked) {
    const normalized = normalizeUpdateFileName(file.name);
    const index =
      byFull.get(normalized) ??
      byBase.get(normalized.slice(normalized.lastIndexOf("/") + 1));
    if (index !== undefined) indices.push(index);
  }
  return [...new Set(indices)];
}

export async function applyTorrentUpdate(
  item: TorrentInfo,
  origin: TorrentOrigin,
  details: TorrentDetails,
  picked: TorrentDetailFile[]
): Promise<boolean> {
  const fetched = await fetchFreshTorrentBytes(origin, details);
  if (!fetched.ok) {
    showError(tr("torrent.files.update.error"), fetched.error);
    return false;
  }
  const [newId, addError] = await attempt(
    torrentApi.startTorrentDownload({
      fileBytes: fetched.bytes,
      saveDir: item.save_dir,
      onlyFiles: null,
      subFolder: null,
      sequential: false,
    })
  );
  if (addError || newId === undefined) {
    showError(tr("torrent.files.update.error"), addError?.message ?? "");
    return false;
  }
  const [freshFiles] = await attempt(torrentApi.runningTorrentFiles(newId));
  const indices = matchPickedIndices(picked, freshFiles ?? []);
  if (indices.length > 0 && indices.length < (freshFiles ?? []).length) {
    const [, selectError] = await attempt(
      torrentApi.updateOnlyFiles(newId, indices, undefined)
    );
    if (selectError) showError(tr("torrent.files.update.error"), selectError.message);
  }
  const [, sourceError] = await attempt(torrentApi.setTorrentSource(newId, origin, undefined));
  if (sourceError) showError(tr("torrent.files.update.error"), sourceError.message);
  const [, removeError] = await attempt(torrentApi.removeTorrent(item.id, false));
  if (removeError) {
    showError(tr("torrent.files.update.error"), removeError.message);
    return false;
  }
  showInfo(tr("torrent.files.update.done"), item.name);
  return true;
}
