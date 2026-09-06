import { CORE_DEFAULT_LABELS } from "@/config/collection/defaults.config";
import type { TranslationKey } from "@/lib/locale/i18n.utils";
import type { CollectionStatusDef } from "@/types/collection";

export function statusColorOf(statuses: CollectionStatusDef[], id: string): string {
  return statuses.find((s) => s.id === id)?.color ?? "#9ca3af";
}

export function statusLabel(
  statuses: CollectionStatusDef[],
  id: string,
  t: (key: TranslationKey) => string
): string {
  const def = statuses.find((s) => s.id === id);
  if (!def) return id;
  if (def.isCore && CORE_DEFAULT_LABELS[def.id] === def.label) {
    return t(`collection.status.${def.id}` as TranslationKey);
  }
  return def.label;
}

export function formatDate(ts: number | null): string {
  if (!ts) return "-";
  return new Date(ts).toLocaleDateString();
}

export function buildCustomStatusId(label: string): string | null {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
  if (!slug) return null;
  return `custom_${slug}_${Date.now().toString(36)}`;
}
