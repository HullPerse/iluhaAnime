import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/i18n";
import type { CollectionStatus, CollectionStatusDef } from "@/types/collection";
import { useStatusLabel } from "./context.collection";

export function CollectionStatusTabs({
  statuses,
  selectedStatus,
  onSelect,
}: {
  statuses: CollectionStatusDef[];
  selectedStatus: CollectionStatus | "all";
  onSelect: (status: CollectionStatus | "all") => void;
}) {
  const { t } = useI18n();
  const statusLabel = useStatusLabel();
  const tabs = [
    { id: "all" as CollectionStatus | "all", label: t("collection.library.all"), color: null },
    ...statuses.map((s) => ({
      id: s.id,
      label: statusLabel(s.id),
      color: s.color,
    })),
  ];
  return (
    <section
      className="windows95-active-border bg-primary flex gap-1 overflow-x-auto p-1"
      aria-label={t("collection.section.library")}
    >
      {tabs.map((tab) => (
        <Button
          key={tab.id}
          variant={selectedStatus === tab.id ? "outline" : "default"}
          className="h-6 px-2 text-xs"
          onClick={() => onSelect(tab.id)}
        >
          {tab.color && (
            <span
              className="windows95-border inline-block size-2.5"
              style={{ backgroundColor: tab.color }}
              aria-hidden
            />
          )}
          {tab.label}
        </Button>
      ))}
    </section>
  );
}