import { Button } from "@/components/ui/button.component";
import type { DetailsTab, DetailsTabEntry } from "@/types/core/panels.details";

export function DetailsTabBar({
  tabs,
  activeTab,
  title,
  onSelect,
}: {
  tabs: DetailsTabEntry[];
  activeTab: DetailsTab;
  title: string;
  onSelect: (tab: DetailsTab) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1" role="tablist" aria-label={title}>
      {tabs.map((entry) => (
        <Button
          key={entry.id}
          variant={activeTab === entry.id ? "default" : "ghost"}
          size="default"
          role="tab"
          aria-selected={activeTab === entry.id}
          onClick={() => onSelect(entry.id)}
          disabled={activeTab === entry.id}
        >
          {entry.label}
          {typeof entry.count === "number" ? ` (${entry.count})` : ""}
        </Button>
      ))}
    </div>
  );
}
