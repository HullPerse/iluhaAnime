import type { TranslationKey } from "@/types/i18n";
import type { SourceInfo, SourceKind } from "@/types/session";

const SOURCE_KIND_KEYS: Record<SourceKind, TranslationKey> = {
  deepLink: "lobby.playlist.source.deepLink",
  file: "lobby.playlist.source.file",
  folder: "lobby.playlist.source.folder",
  hostSeeded: "lobby.playlist.source.hostTorrent",
  magnet: "lobby.playlist.source.magnet",
  torrent: "lobby.playlist.source.torrent",
};

export function sourceKindKey(kind: SourceKind): TranslationKey {
  return SOURCE_KIND_KEYS[kind];
}

export function detectSourceKind(value: string): SourceKind {
  const trimmed = value.trim().toLowerCase();
  if (trimmed.startsWith("magnet:")) return "magnet";
  if (trimmed.startsWith("iluhaanime://torrent/")) return "deepLink";
  if (trimmed.endsWith(".torrent")) return "torrent";
  return "file";
}

export function sourceDisplayText(source: SourceInfo): string | null {
  if (source.label !== null && source.label.trim().length > 0) return source.label;
  if (source.value !== null && source.value.trim().length > 0) return source.value;
  return null;
}

export function buildHostMagnet(infoHash: string, name: string): string {
  const hash = infoHash.trim().toLowerCase();
  const label = name.trim();
  return label.length > 0
    ? `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(label)}`
    : `magnet:?xt=urn:btih:${hash}`;
}
