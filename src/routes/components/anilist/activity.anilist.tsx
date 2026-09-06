import { useState } from "react";

import Modal from "@/components/shared/modal.component";
import Tabs from "@/components/shared/tabs.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { AniListCollection } from "@/types/anilist";

import { CalendarTab } from "./activity/calendarTab.activity";
import { FeedTab } from "./activity/feedTab.activity";

function ActivityHistoryModal({
  userId,
  friendIds,
  lists,
  initialTab,
  onClose,
  onAnimeClick,
}: {
  userId: number;
  friendIds: number[];
  lists: AniListCollection[];
  initialTab: "feed" | "calendar";
  onClose: () => void;
  onAnimeClick: (id: number) => void;
}) {
  const [tab, setTab] = useState<"feed" | "calendar">(initialTab);
  const { t } = useI18n();

  return (
    <Modal header={t("anilist.activity.title")} onClose={onClose} className="w-5xl">
      <Tabs
        ariaLabel={t("anilist.activity.title")}
        tabs={[
          { id: "feed", label: t("anilist.activity.feed") },
          { id: "calendar", label: t("anilist.activity.calendar") },
        ]}
        activeTab={tab}
        onChange={setTab}
      />
      <div className="bg-primary min-h-0 w-full flex-1 overflow-y-auto">
        {tab === "feed" ? (
          <FeedTab
            userId={userId}
            friendIds={friendIds}
            lists={lists}
            onAnimeClick={onAnimeClick}
          />
        ) : (
          <CalendarTab lists={lists} onAnimeClick={onAnimeClick} />
        )}
      </div>
    </Modal>
  );
}

export default ActivityHistoryModal;
