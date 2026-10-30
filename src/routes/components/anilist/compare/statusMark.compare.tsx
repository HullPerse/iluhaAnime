import { useI18n } from "@/hooks/i18n.hook";
import { listStatusLabels } from "@/config/system/labels.config";
import { getStatusColor } from "@/lib/anilist/entries.utils";
import { toLocaleKey } from "@/lib/locale/key.utils";

export function StatusMark({ status }: { status: string }) {
  const { t } = useI18n();
  if (!status) return <span className="size-2 shrink-0" aria-hidden />;
  const normalized = status.toUpperCase();
  const key = listStatusLabels[normalized];
  const label = key ? t(toLocaleKey(key)) : status;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="windows95-small-border inline-block size-2 shrink-0"
      style={{ backgroundColor: getStatusColor(normalized) }}
    />
  );
}
