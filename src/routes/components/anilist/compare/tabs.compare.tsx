import Tabs from "@/components/shared/tabs.component";
import { useI18n } from "@/hooks/i18n.hook";
import type { CompareSummary } from "@/types/core/compare";
import { TAB_KEYS } from "@/routes/components/anilist/compare/constants.compare";
import type { CompareTab } from "@/routes/components/anilist/compare/constants.compare";

export function CompareTabs({
  tab,
  summary,
  friendName,
  onTab,
}: {
  tab: CompareTab;
  summary: CompareSummary;
  friendName: string;
  onTab: (tab: CompareTab) => void;
}) {
  const { t } = useI18n();
  const tabs = [
    {
      id: "shared" as const,
      label: `${t(TAB_KEYS.shared)} (${summary.shared.length})`,
    },
    {
      id: "mine" as const,
      label: `${t(TAB_KEYS.mine)} (${summary.onlyMine.length})`,
    },
    {
      id: "friend" as const,
      label: `${t("anilist.compare.only.name", { name: friendName })} (${summary.onlyFriend.length})`,
    },
  ];
  return (
    <div className="shrink-0 border-t border-black/20 p-2">
      <Tabs ariaLabel={t("anilist.compare.compare")} tabs={tabs} activeTab={tab} onChange={onTab} />
    </div>
  );
}
