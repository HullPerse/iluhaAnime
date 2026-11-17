import type { Source, SourceInfo } from "@/types/search/search";

export const SOURCE_INFOS: SourceInfo[] = [
  { label: "Rutracker", nsfw: false, value: "rutracker" },
  { label: "nekoBT", nsfw: false, value: "nekobt" },
  { label: "Erai-Raws", nsfw: false, value: "erai-raws" },
  { label: "Nyaa.si", nsfw: false, value: "nyaa" },
  { label: "Sukebei", nsfw: true, value: "sukebei" },
];

/** Every search source must point at the probe that uses its own proxy setting. */
export const SOURCE_DIAGNOSTIC_PROBE: Record<Source, string> = {
  rutracker: "torrent-rutracker",
  nyaa: "torrent-nyaa",
  sukebei: "torrent-sukebei",
  nekobt: "torrent-nekobt",
  "erai-raws": "torrent-erai",
};
