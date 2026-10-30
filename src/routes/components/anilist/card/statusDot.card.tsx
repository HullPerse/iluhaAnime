import { useI18n } from "@/hooks/i18n.hook";
import { getStatusColor } from "@/lib/anilist/entries.utils";
import { toLocaleKey } from "@/lib/locale/key.utils";
import { listStatusLabels } from "@/config/system/labels.config";

export function StatusDot({ status }: { status: string }) {
  const { t } = useI18n();
  return (
    <span
      className="windows95-border mt-0.5 shrink-0"
      style={{
        display: "inline-block",
        width: 10,
        height: 10,
        backgroundColor: getStatusColor(status),
      }}
      title={t(toLocaleKey(listStatusLabels[status] ?? status))}
    />
  );
}
