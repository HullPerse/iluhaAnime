import { keysOf } from "@/lib/core/keysOf.utils";
import Tabs from "@/components/shared/tabs.component";
import { useI18n } from "@/hooks/i18n.hook";
import type { FriendView } from "@/types/anilist/anilist";

const VIEW_LABELS = {
  profile: "anilist.compare.profile",
  compare: "anilist.compare.compare",
} as const;

export type { FriendView } from "@/types/anilist/anilist";

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
        tabs={keysOf(VIEW_LABELS).map((value) => ({
          id: value,
          label: t(VIEW_LABELS[value]),
        }))}
        activeTab={view}
        onChange={onChange}
      />
    </div>
  );
}
