import Tabs from "@/components/shared/tabs.component";
import { useI18n } from "@/hooks/i18n.hook";

const VIEW_LABELS = {
  profile: "anilist.compare.profile",
  compare: "anilist.compare.compare",
} as const;

export type FriendView = keyof typeof VIEW_LABELS;

export function ViewTabs({
  view,
  onChange,
}: {
  view: FriendView;
  onChange: (next: FriendView) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="shrink-0">
      <Tabs
        ariaLabel={t("anilist.friends.title")}
        tabs={(Object.keys(VIEW_LABELS) as FriendView[]).map((value) => ({
          id: value,
          label: t(VIEW_LABELS[value]),
        }))}
        activeTab={view}
        onChange={onChange}
      />
    </div>
  );
}
