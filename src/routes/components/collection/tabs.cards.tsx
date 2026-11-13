import { cn } from "cn";
import { useCell } from "@hullperse/hp_utils/react";

import { Button } from "@/components/ui/button.component";
import { cardsTabLabelKeys } from "@/config/cards/labels.config";
import { useCardsStats, useCardsUnread } from "@/hooks/cards/queries.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { cardsAtoms, setCardsAlbumMode, setCardsTab } from "@/store/cards.store";
import type { CardsAlbumMode, CardsTab } from "@/types/store/cards";

const ALBUM_MODES: readonly { value: CardsAlbumMode; labelKey: "collection.mode.all" | "collection.mode.collections" }[] = [
  { value: "all", labelKey: "collection.mode.all" },
  { value: "collections", labelKey: "collection.mode.collections" },
];

const NAV_GROUPS: readonly {
  id: string;
  titleKey: "collection.nav.cards" | "collection.nav.shopGroup";
  tabs: readonly CardsTab[];
}[] = [
  { id: "cards", titleKey: "collection.nav.cards", tabs: ["packs", "album", "gifts"] },
  { id: "shop", titleKey: "collection.nav.shopGroup", tabs: ["shop"] },
];

export default function TabsCards() {
  const { t } = useI18n();
  const tab = useCell(cardsAtoms.tab);
  const albumMode = useCell(cardsAtoms.albumMode);
  const stats = useCardsStats();
  const totalCards = stats.data?.totalCards;
  const packsReadAt = useCell(cardsAtoms.packsReadAt);
  const albumReadAt = useCell(cardsAtoms.albumReadAt);
  const unread = useCardsUnread(packsReadAt, albumReadAt);
  const unreadPacks = unread.data?.packs ?? 0;
  const unreadCards = unread.data?.cards ?? 0;

  return (
    <nav className="flex min-h-0 flex-col gap-1">
      {NAV_GROUPS.map((group) => {
        const groupActive = group.tabs.includes(tab);
        const single = group.tabs[0];
        if (group.tabs.length === 1 && single !== undefined) {
          return (
            <div key={group.id} role="tablist" aria-orientation="vertical">
              <Button
                role="tab"
                aria-selected={groupActive}
                aria-current={groupActive ? "page" : undefined}
                className={cn(
                  "flex h-6 w-full justify-start text-xs",
                  groupActive && "bg-highlight border-transparent text-white"
                )}
                disabled={groupActive}
                onClick={() => setCardsTab(single)}
              >
                <span className="min-w-0 flex-1 truncate text-left">
                  {t(cardsTabLabelKeys[single])}
                </span>
              </Button>
            </div>
          );
        }
        return (
          <div key={group.id} className="flex flex-col gap-0.5">
            <Button
              className={cn(
                "flex h-6 w-full justify-start text-xs",
                groupActive && "bg-secondary font-bold text-white"
              )}
              disabled={groupActive}
              onClick={() => {
                const first = group.tabs[0];
                if (first !== undefined) setCardsTab(first);
              }}
            >
              <span className="min-w-0 flex-1 truncate text-left">{t(group.titleKey)}</span>
              {group.id === "cards" && totalCards !== undefined && (
                <span
                  data-testid="collection-card-count"
                  className="windows95-text tabular-nums opacity-70"
                  title={t("collection.album.total", { total: totalCards })}
                >
                  {totalCards}
                </span>
              )}
            </Button>
            <div
              role="tablist"
              aria-orientation="vertical"
              className="border-muted ml-2 flex flex-col gap-0.5 border-l pl-1.5"
            >
              {group.tabs.map((value) => {
                const active = value === tab;
                const unreadCount = value === "packs" ? unreadPacks : value === "album" ? unreadCards : 0;
                return (
                  <div key={value} className="flex flex-col gap-0.5">
                    <Button
                      role="tab"
                      aria-selected={active}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex h-6 w-full justify-start text-xs",
                        active && "bg-highlight border-transparent text-white"
                      )}
                      disabled={active}
                      onClick={() => setCardsTab(value)}
                    >
                      <span className="min-w-0 flex-1 truncate text-left">
                        {t(cardsTabLabelKeys[value])}
                      </span>
                      {unreadCount > 0 && (
                        <span
                          data-testid={`collection-unread-${value}`}
                          className="cards-tab-unread"
                          aria-label={t("collection.unread", { count: unreadCount })}
                        >
                          [{unreadCount}]
                        </span>
                      )}
                    </Button>
                    {value === "album" && active && (
                      <div className="border-muted ml-2 flex flex-col gap-0.5 border-l pl-1.5">
                        {ALBUM_MODES.map((item) => (
                          <Button
                            key={item.value}
                            className={cn(
                              "h-5 w-full justify-start px-1 text-[11px]",
                              albumMode === item.value &&
                                "bg-highlight border-transparent text-white"
                            )}
                            aria-pressed={albumMode === item.value}
                            onClick={() => setCardsAlbumMode(item.value)}
                          >
                            <span className="min-w-0 flex-1 truncate text-left">
                              {t(item.labelKey)}
                            </span>
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}
