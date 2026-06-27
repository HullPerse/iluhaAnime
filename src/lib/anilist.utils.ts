import { AniListEntry, AniListSort } from "@/types/anilist";

export const statusLabels: Record<string, string> = {
  FINISHED: "Завершён",
  RELEASING: "Выходит",
  NOT_YET_RELEASED: "Анонс",
  CANCELLED: "Отменён",
  HIATUS: "На паузе",
};

export const formatLabels: Record<string, string> = {
  TV: "ТВ",
  TV_SHORT: "ТВ (короткий)",
  MOVIE: "Фильм",
  SPECIAL: "Спешл",
  OVA: "OVA",
  ONA: "ONA",
  MUSIC: "Клип",
};

export const seasonLabels: Record<string, string> = {
  WINTER: "Зима",
  SPRING: "Весна",
  SUMMER: "Лето",
  FALL: "Осень",
};

const listStatusLabels: Record<string, string> = {
  CURRENT: "Смотрю",
  PLANNING: "Запланировано",
  COMPLETED: "Просмотрено",
  DROPPED: "Брошено",
  PAUSED: "На паузе",
  REPEATING: "Пересматриваю",
  WATCHING: "В процессе",
};

export const listStatusOptions = Object.entries(listStatusLabels).map(
  ([value, label]) => ({ value, label }),
);

export function filterEntries(
  entries: AniListEntry[],
  searchTerms: string,
  global: boolean,
) {
  return entries.filter((e) => {
    if (!searchTerms.trim() || global) return true;

    const query = searchTerms.toLowerCase();

    return (
      e.media.title.toLowerCase().includes(query) ||
      e.media.titles.some((t) => t.toLowerCase().includes(query))
    );
  });
}

export function sortEntries(
  filtered: AniListEntry[],
  direction: AniListSort["dir"],
  method: AniListSort["key"],
): AniListEntry[] {
  const copy = [...filtered];

  const sortMap = {
    title: () =>
      copy.sort((a, b) => {
        const c = a.media.title.localeCompare(b.media.title);
        return direction === "asc" ? c : -c;
      }),
    score: () =>
      copy.sort((a, b) => {
        const d = (b.media.score ?? -1) - (a.media.score ?? -1);
        return direction === "desc" ? d : -d;
      }),
    progress: () =>
      copy.sort((a, b) => {
        const d = (b.progress ?? -1) - (a.progress ?? -1);
        return direction === "desc" ? d : -d;
      }),
  } as Record<AniListSort["key"], () => AniListEntry[]>;

  return sortMap[method]();
}

export function getSortingLabel(
  sort: string,
  direction: "asc" | "desc",
): string {
  const labelMap: Record<string, string> = {
    title: "Название",
    score: "Рейтинг",
    progress: "Прогресс",
    relevance: "Релевантность",
    popularity: "Популярность",
    year: "Год",
  };

  return `${labelMap[sort] ?? sort} ${direction === "asc" ? "↑" : "↓"}`;
}

export function getStatusLabel(status: string) {
  const statusMap = {
    FINISHED: "Завершён",
    RELEASING: "Выходит",
    NOT_YET_RELEASED: "Анонс",
    CANCELLED: "Отменён",
    HIATUS: "На паузе",
  } as Record<string, string>;

  return statusMap[status];
}

export function getListLabel(list: string) {
  return listStatusLabels[list];
}
