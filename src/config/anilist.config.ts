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

export const listStatusOptions: { value: string; label: string }[] = [
  { value: "CURRENT", label: "Смотрю" },
  { value: "PLANNING", label: "Запланировано" },
  { value: "COMPLETED", label: "Просмотрено" },
  { value: "DROPPED", label: "Брошено" },
  { value: "PAUSED", label: "На паузе" },
  { value: "REPEATING", label: "Пересматриваю" },
];
