import type { TranslationKey } from "@/lib/locale/i18n.utils";

const STATUS_KEYS: Readonly<Record<string, TranslationKey>> = {
  ongoing: "manga.sourceStatus.ongoing",
  progress: "manga.sourceStatus.ongoing",
  completed: "manga.sourceStatus.completed",
  finished: "manga.sourceStatus.completed",
  hiatus: "manga.sourceStatus.hiatus",
  frozen: "manga.sourceStatus.frozen",
  cancelled: "manga.sourceStatus.cancelled",
  dropped: "manga.sourceStatus.cancelled",
  abandoned: "manga.sourceStatus.cancelled",
};

export function mangaSourceStatus(
  status: string | null | undefined,
  translate: (key: TranslationKey) => string
): string | null {
  const value = status?.trim();
  if (!value) return null;
  const key = STATUS_KEYS[value.toLowerCase()];
  return key ? translate(key) : value;
}
