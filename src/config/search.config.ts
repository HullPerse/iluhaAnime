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

export function getSourceInfo(value: string): SourceInfo | undefined {
  return SOURCE_INFOS.find((s) => s.value === value);
}

export const nyaaSorts = [
  { value: "seeders", label: "Сидеры" },
  { value: "leechers", label: "Личи" },
  { value: "size", label: "Размер" },
  { value: "date", label: "Дата" },
  { value: "name", label: "Название" },
  { value: "downloads", label: "Скачивания" },
] as const;
