import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import type { StatsTab } from "@/types/anilist/stats.anilist";

const TABS = [
  { value: "overview", label: "anilist.stats.overview" },
  { value: "calendar", label: "anilist.stats.calendar" },
  { value: "released", label: "anilist.stats.released" },
] as const;

export function TabButtons({ tab, onTab }: { tab: StatsTab; onTab: (next: StatsTab) => void }) {
  const { t } = useI18n();
  return (
    <div className="mb-1 flex gap-1">
      {TABS.map((item) => (
        <Button
          key={item.value}
          variant={tab === item.value ? "outline" : "default"}
          className="h-6 text-xs"
          onClick={() => onTab(item.value)}
        >
          {t(item.label)}
        </Button>
      ))}
    </div>
  );
}
