import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef } from "react";

import { listStatusLabels } from "@/config/anilist/labels.config";
import {
  ANILIST_SCROLL_HEADER_ESTIMATE,
  ANILIST_SCROLL_ROW_ESTIMATE,
} from "@/config/anilist/list.config";
import { getStatusColor, type EntryLookup } from "@/lib/anilist/entries.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import { toLocaleKey } from "@/lib/locale/key.utils";
import AniListEntryCard from "@/routes/components/anilist/card.anilist";
import { GroupHeaderCollection } from "@/routes/components/collection/groupHeader.collection";
import { useSettingsStore } from "@/store/settings.store";
import type { AniListAnime, AniListGroup, AniListScrollRow, AniMedia } from "@/types/anilist";

export default function AniListScrollView({
  items,
  entryLookup,
  favouriteIds,
  onSelect,
  groups,
  collapsedLists,
  onToggleListCollapsed,
}: {
  items: AniMedia[];
  entryLookup: EntryLookup;
  favouriteIds: Set<number>;
  onSelect: (anime: AniListAnime) => void;
  groups?: AniListGroup[];
  collapsedLists?: Set<string>;
  onToggleListCollapsed?: (name: string) => void;
}) {
  const { t } = useI18n();
  const parentRef = useRef<HTMLElement>(null);
  const headerVariant = useSettingsStore((s) => s.collectionGroupHeaderStyle);
  const rows = useMemo<AniListScrollRow[] | null>(() => {
    if (!groups?.length) return null;
    const out: AniListScrollRow[] = [];
    for (const group of groups) {
      out.push({ kind: "header", name: group.name });
      if (collapsedLists?.has(group.name)) continue;
      for (const entry of group.entries) out.push({ kind: "item", media: entry.media });
    }
    return out;
  }, [groups, collapsedLists]);
  const grouped = rows !== null;
  const groupCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const group of groups ?? []) map.set(group.name, group.entries.length);
    return map;
  }, [groups]);

  const rowVirtualizer = useVirtualizer({
    count: rows?.length ?? items.length,
    getScrollElement: () => parentRef.current,
    getItemKey: (index) => {
      if (!grouped) return items[index]?.id ?? index;
      const row = rows?.[index];
      if (!row) return index;
      return row.kind === "header" ? `header-${row.name}` : row.media.id;
    },
    estimateSize: (index) => {
      if (!grouped) return ANILIST_SCROLL_ROW_ESTIMATE;
      return rows?.[index]?.kind === "header"
        ? ANILIST_SCROLL_HEADER_ESTIMATE
        : ANILIST_SCROLL_ROW_ESTIMATE;
    },
    overscan: 4,
  });

  return (
    <section
      ref={parentRef}
      className="windows95-border flex min-h-0 w-full flex-1 flex-col gap-1 overflow-y-auto border bg-white p-1"
    >
      <div className="relative w-full" style={{ height: rowVirtualizer.getTotalSize() }}>
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const row = grouped ? (rows?.[virtualRow.index] ?? null) : null;
          if (grouped && !row) return null;
          const media = grouped
            ? row?.kind === "item"
              ? row.media
              : null
            : (items[virtualRow.index] ?? null);
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={(el) => {
                if (el) rowVirtualizer.measureElement(el);
              }}
              className="absolute top-0 left-0 w-full pb-1"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              {row?.kind === "header" ? (
                <GroupHeaderCollection
                  label={t(toLocaleKey(listStatusLabels[row.name.toUpperCase()] ?? row.name))}
                  color={getStatusColor(row.name.toUpperCase())}
                  count={groupCounts.get(row.name) ?? 0}
                  collapsed={Boolean(collapsedLists?.has(row.name))}
                  variant={headerVariant}
                  toggleLabel={t("anilist.sort.group.toggle")}
                  onToggle={() => onToggleListCollapsed?.(row.name)}
                />
              ) : media ? (
                <AniListEntryCard
                  item={media}
                  entryLookup={entryLookup}
                  isFavorite={favouriteIds.has(media.id)}
                  onClick={onSelect}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
