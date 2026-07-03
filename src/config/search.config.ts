export const PER_PAGE = 20;

export interface SourceInfo {
  value: string;
  label: string;
  nsfw: boolean;
}

export const SOURCE_INFOS: SourceInfo[] = [
  { value: "erai-raws", label: "Erai-Raws", nsfw: false },
  { value: "rutracker", label: "Rutracker", nsfw: false },
  { value: "nyaa", label: "Nyaa.si", nsfw: false },
  { value: "nekobt", label: "nekoBT", nsfw: false },
  { value: "sukebei", label: "Sukebei", nsfw: true },
];
