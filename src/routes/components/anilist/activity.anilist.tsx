import { useState } from "react";

import Modal from "@/components/shared/modal.component";
import Tabs from "@/components/shared/tabs.component";
import { useI18n } from "@/hooks/i18n.hook";
import type { buildEntryLookup } from "@/lib/anilist/entries.utils";
import type { AnilistScoreFormat } from "@/lib/anilist/score.utils";
import type { AniListCollection } from "@/types/anilist";

import { CalendarTab } from "./activity/calendarTab.activity";
import { FeedTab } from "./activity/feedTab.activity";
import { NotificationsTab } from "./activity/notificationsTab.activity";
import { AnimeDetailShell } from "./detail/shell.detail";

export interface ActivityDetailBundle {
  entryLookup: ReturnType<typeof buildEntryLookup>;
  scoreFormat?: AnilistScoreFormat | null;
  favouriteIds: Set<number>;
  favouriteStaffIds?: Set<number>;
  favouriteCharacterIds?: Set<number>;
  isLoggedIn: boolean;
  onFavouriteToggle: (animeId: number) => Promise<void>;
  onStaffFavouriteToggle?: (staffId: number) => void;
  onCharacterFavouriteToggle?: (characterId: number) => void;
  onTag: (value: string) => void;
  onGenre: (value: string) => void;
  onStudio?: (id: number, name: string) => void;
  onSeason?: (season: string, year: number | null) => void;
  onSaved?: () => void;
}

function ActivityHistoryModal({
  userId,
  friendIds,
  lists,
  initialTab,
  onClose,
  detail,
}: {
  userId: number;
  friendIds: number[];
  lists: AniListCollection[];
  initialTab: "feed" | "calendar" | "notifications";
  onClose: () => void;
  detail: ActivityDetailBundle;
}) {
  const [tab, setTab] = useState<"feed" | "calendar" | "notifications">(initialTab);
  const [detailStack, setDetailStack] = useState<number[]>([]);
  const { t } = useI18n();

  const openDetail = (id: number) => setDetailStack((prev) => [...prev, id]);
  const detailBack = () => setDetailStack((prev) => prev.slice(0, -1));
  const detailId = detailStack.at(-1);
  const handleDetailFavourite = (animeId: number) => detail.onFavouriteToggle(animeId);
  const handleDetailStaffFavourite = (staffId: number) => detail.onStaffFavouriteToggle?.(staffId);
  const handleDetailCharacterFavourite = (characterId: number) =>
    detail.onCharacterFavouriteToggle?.(characterId);
  const handleDetailTag = (value: string) => detail.onTag(value);
  const handleDetailGenre = (value: string) => detail.onGenre(value);
  const handleDetailStudio = (id: number, name: string) => detail.onStudio?.(id, name);
  const handleDetailSeason = (season: string, year: number | null) =>
    detail.onSeason?.(season, year);
  const handleDetailSaved = () => detail.onSaved?.();
  const handleDetailRelated = (id: number) => setDetailStack((prev) => [...prev, id]);

  if (detailId != null) {
    return (
      <AnimeDetailShell
        animeId={detailId}
        entryLookup={detail.entryLookup}
        scoreFormat={detail.scoreFormat}
        listEntry={detail.entryLookup.get(detailId)}
        isLoggedIn={detail.isLoggedIn}
        favouriteIds={detail.favouriteIds}
        favouriteStaffIds={detail.favouriteStaffIds}
        favouriteCharacterIds={detail.favouriteCharacterIds}
        onFavouriteToggle={handleDetailFavourite}
        onStaffFavouriteToggle={handleDetailStaffFavourite}
        onCharacterFavouriteToggle={handleDetailCharacterFavourite}
        onTag={handleDetailTag}
        onGenre={handleDetailGenre}
        onStudio={handleDetailStudio}
        onSeason={handleDetailSeason}
        onRelated={handleDetailRelated}
        onBack={detailBack}
        onClose={onClose}
        onSaved={handleDetailSaved}
        render={({ title, actions, onBack, body }) => (
          <Modal
            header={title}
            onBack={onBack}
            headerActions={actions}
            onClose={onClose}
            className="w-5xl"
          >
            <div className="bg-primary min-h-0 w-full flex-1 overflow-y-auto">{body}</div>
          </Modal>
        )}
      />
    );
  }

  return (
    <Modal header={t("anilist.activity.title")} onClose={onClose} className="w-5xl">
      <div className="shrink-0">
        <Tabs
          ariaLabel={t("anilist.activity.title")}
          tabs={[
            { id: "feed", label: t("anilist.activity.feed") },
            { id: "calendar", label: t("anilist.activity.calendar") },
            { id: "notifications", label: t("anilist.activity.notifications") },
          ]}
          activeTab={tab}
          onChange={setTab}
        />
      </div>
      <div className="bg-primary min-h-0 w-full flex-1 overflow-y-auto">
        {tab === "feed" ? (
          <FeedTab userId={userId} friendIds={friendIds} lists={lists} onAnimeClick={openDetail} />
        ) : tab === "notifications" ? (
          <NotificationsTab onAnimeClick={openDetail} />
        ) : (
          <CalendarTab lists={lists} onAnimeClick={openDetail} />
        )}
      </div>
    </Modal>
  );
}

export default ActivityHistoryModal;
