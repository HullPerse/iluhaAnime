import { enUS, ru } from "date-fns/locale";

export function dateFnsLocale(locale: string) {
  return locale === "ru" ? ru : enUS;
}
