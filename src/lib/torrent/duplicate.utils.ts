import type { TorrentInfo } from "@/types/torrent";

const HEX40_RX = /^[0-9a-f]{40}$/i;
const BASE32_RX = /^[a-z2-7]{32}$/i;
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32ToHex(value: string): string | null {
  const clean = value.toUpperCase().replace(/=+$/, "");
  if (!BASE32_RX.test(clean)) return null;
  let acc = 0;
  let bits = 0;
  const bytes: number[] = [];
  for (const ch of clean) {
    acc = (acc << 5) | BASE32_ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((acc >> bits) & 0xff);
    }
  }
  if (bytes.length !== 20) return null;
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function normalizeInfoHash(hash: string): string | null {
  const clean = hash.trim().toLowerCase();
  if (HEX40_RX.test(clean)) return clean;
  const decoded = base32ToHex(clean);
  return decoded;
}

export function parseInfoHashFromMagnet(magnet: string): string | null {
  const match = /xt=urn:btih:([^&]+)/i.exec(magnet);
  if (!match) return null;
  return normalizeInfoHash(decodeURIComponent(match[1]));
}

export function findDuplicateByHash(
  torrents: readonly TorrentInfo[],
  hash: string
): TorrentInfo | null {
  const want = normalizeInfoHash(hash);
  if (!want) return null;
  for (const torrent of torrents) {
    if (torrent.info_hash.toLowerCase() === want) return torrent;
  }
  return null;
}

export function duplicateOfMagnet(
  torrents: readonly TorrentInfo[],
  magnet: string | undefined
): TorrentInfo | null {
  if (!magnet) return null;
  const hash = parseInfoHashFromMagnet(magnet);
  if (!hash) return null;
  return findDuplicateByHash(torrents, hash);
}
