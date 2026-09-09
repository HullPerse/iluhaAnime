import { CORE_DEFAULT_LABELS } from "@/config/collection/defaults.config";
import type { TranslationKey } from "@/lib/locale/i18n.utils";
import type { Locale } from "@/types";
import type { CollectionStatusDef } from "@/types/collection";

export function statusColorOf(statuses: CollectionStatusDef[], id: string): string {
  return statuses.find((s) => s.id === id)?.color ?? "#9ca3af";
}

export interface BilingualLabel {
  en: string;
  ru: string;
}

export function splitStatusLabel(label: string): BilingualLabel {
  const comma = label.indexOf(",");
  if (comma === -1) {
    const single = label.trim();
    return { en: single, ru: single };
  }
  const en = label.slice(0, comma).trim();
  const ru = label.slice(comma + 1).trim();
  return { en: en || ru, ru: ru || en };
}

export function normalizeStatusLabel(label: string): string {
  const comma = label.indexOf(",");
  if (comma === -1) return label.trim();
  const en = label.slice(0, comma).trim();
  const ru = label.slice(comma + 1).trim();
  if (!en && !ru) return "";
  return `${en},${ru}`;
}

export function resolveStatusLabel(label: string, locale: Locale): string {
  const parts = splitStatusLabel(label);
  return locale === "ru" ? parts.ru : parts.en;
}

export function statusLabel(
  statuses: CollectionStatusDef[],
  id: string,
  t: (key: TranslationKey) => string,
  locale: Locale
): string {
  const def = statuses.find((s) => s.id === id);
  if (!def) return id;
  if (def.isCore && CORE_DEFAULT_LABELS[def.id] === def.label) {
    return t(`collection.status.${def.id}` as TranslationKey);
  }
  return resolveStatusLabel(def.label, locale);
}

export function formatDate(ts: number | null): string {
  if (!ts) return "-";
  return new Date(ts).toLocaleDateString();
}

export function buildCustomStatusId(label: string): string {
  const parts = splitStatusLabel(label);
  const source = parts.en || parts.ru;
  const slug = source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
  const stamp = Date.now().toString(36);
  if (!slug) return `custom_${stamp}`;
  return `custom_${slug}_${stamp}`;
}
