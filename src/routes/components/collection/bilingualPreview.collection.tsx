import { splitStatusLabel } from "@/lib/collection/status.utils";
import { useI18n } from "@/lib/locale/i18n.utils";

export function BilingualPreview({ value }: { value: string }) {
  const { t } = useI18n();
  if (!value.includes(",")) return null;
  const parts = splitStatusLabel(value);
  if (!parts.en && !parts.ru) return null;
  return (
    <span className="flex w-full flex-wrap items-center gap-1 pt-0.5 text-xs" aria-live="polite">
      <span className="windows95-border bg-surface px-1">
        {t("collection.status.manager.preview.en", { value: parts.en || "-" })}
      </span>
      <span className="windows95-border bg-field px-1">
        {t("collection.status.manager.preview.ru", { value: parts.ru || "-" })}
      </span>
    </span>
  );
}
