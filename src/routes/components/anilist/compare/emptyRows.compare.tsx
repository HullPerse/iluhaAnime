import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import type { CompareTab } from "@/routes/components/anilist/compare/constants.compare";

export function EmptyRows({
  tab,
  query,
  friendName,
  onClear,
}: {
  tab: CompareTab;
  query: string;
  friendName: string;
  onClear: () => void;
}) {
  const { t } = useI18n();
  if (query.trim()) {
    return (
      <div className="flex flex-col items-center gap-1 p-3">
        <p className="windows95-text text-hint text-center text-xs">
          {t("anilist.compare.no.match")}
        </p>
        <Button variant="outline" className="h-6 text-xs" onClick={onClear}>
          {t("anilist.compare.clear")}
        </Button>
      </div>
    );
  }
  const labelsByTab = {
    shared: t("anilist.compare.no.shared"),
    mine: t("anilist.compare.no.mine.titles"),
    friend: t("anilist.compare.no.friend.titles", { name: friendName }),
  };
  const label = labelsByTab[tab];
  return <p className="windows95-text text-hint p-3 text-center text-xs">{label}</p>;
}
