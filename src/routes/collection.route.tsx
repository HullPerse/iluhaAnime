import { useVirtualizer } from "@tanstack/react-virtual";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm.component";
import { SelectDialog } from "@/components/shared/prompt.component";
import { CARD_H, CARD_W } from "@/config/collection.config";
import { useCollectionDataActions } from "@/hooks/collectionData.hook";
import { filterCollectionItems } from "@/lib/collectionFilter.utils";
import { calculateCollectionStats } from "@/lib/collectionStats.utils";
import { useCollectionData, useCollectionMutations, useCollectionSearch } from "@/lib/collection.queries";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { StatusMetaContext } from "@/routes/components/collection/context.collection";
import { StatusManagerModal } from "@/routes/components/collection/status.modal";
import { useCollectionStore } from "@/store/collection.store";
import { useNotificationStore } from "@/store/notification.store";
import { useSettingsStore } from "@/store/settings.store";
import type { CollectionItem, CollectionStatus } from "@/types/collection";
import { CollectionDetailModal } from "./components/collection/detail.collection";
import { CollectionFiltersPanel } from "./components/collection/filters.collection";
import { CollectionItemsGrid } from "./components/collection/grid.collection";
import { CollectionStatusGroups } from "./components/collection/grouped.collection";
import { CollectionStatisticsSection } from "./components/collection/stats.collection";
import { CollectionStatusTabs } from "./components/collection/statusTabs.collection";
import { CollectionToolbar } from "./components/collection/toolbar.collection";
import { WizardModal } from "./components/collection/wizard/modal.wizard";

export { CARD_H, CARD_POSTER_H, CARD_W } from "@/config/collection.config";
export { CollectionCard } from "./components/collection/card.collection";

export default function CollectionRoute() {
  const {
    selectedStatus,
    searchQuery,
    sortBy,
    sortDir,
    filters,
    activeSection,
    groupByStatus,
    collapsedStatuses,
    setSearchQuery,
    setSelectedStatus,
    setSort,
    setFilters,
    setGroupByStatus,
    toggleStatusCollapsed,
  } = useCollectionStore();
  const { items, reviews, customFieldDefs, statuses } = useCollectionData();
  const mutations = useCollectionMutations();
  const dataActions = useCollectionDataActions();
  const { t } = useI18n();
  const addItem = (item: Omit<CollectionItem, "id" | "addedAt" | "updatedAt">) =>
    mutations.addItem(item);
  const updateItem = (id: string, patch: Partial<CollectionItem>) =>
    mutations.updateItem(id, patch);
  const removeItem = (id: string) => mutations.removeItem(id);
  const notifyMetadata = useCallback(
    (type: "success" | "error" | "info", key: TranslationKey) => {
      useNotificationStore.getState().add(t("app.collection"), type, t(key));
    },
    [t]
  );

  const refreshAniListMetadata = useCallback(
    async (item: CollectionItem) => {
      const m = await invoke<{
        title: string;
        duration: number | null;
        episodes: number | null;
        genres: string[];
        studios: { name: string }[];
        cover_url: string | null;
        season_year: number | null;
      }>("get_anime_by_id", { id: item.externalIds.anilist });
      updateItem(item.id, {
        title: m.title || item.title,
        durationMinutes: m.duration ?? item.durationMinutes,
        progressTotal: m.episodes ?? item.progressTotal,
        genres: m.genres.length ? m.genres : item.genres,
        studio: m.studios[0]?.name ?? item.studio,
        coverUrl: m.cover_url ?? item.coverUrl,
        year: m.season_year ?? item.year,
      });
    },
    [updateItem]
  );

  const refreshTmdbMetadata = useCallback(
    async (item: CollectionItem) => {
      const tmdbKey = useSettingsStore.getState().tmdbApiKey;
      if (!tmdbKey) {
        notifyMetadata("error", "collection.wizard.tmdbKeyMissing");
        return;
      }
      const d = await invoke<{
        title: string;
        overview: string | null;
        year: number | null;
        runtimeMinutes: number | null;
        genres: string[];
        posters: { url: string }[];
      }>("get_tmdb_details", {
        apiKey: tmdbKey,
        tmdbId: item.externalIds.tmdb,
        mediaType: item.type === "movie" ? "movie" : "tv",
      });
      updateItem(item.id, {
        title: d.title || item.title,
        description: d.overview ?? item.description,
        year: d.year ?? item.year,
        durationMinutes: d.runtimeMinutes ?? item.durationMinutes,
        genres: d.genres.length ? d.genres : item.genres,
        coverUrl: d.posters[0]?.url ?? item.coverUrl,
      });
    },
    [notifyMetadata, updateItem]
  );

  const refreshMetadata = useCallback(
    async (item: CollectionItem) => {
      try {
        if (item.externalIds.anilist != null)
          await refreshAniListMetadata(item);
        else if (item.externalIds.tmdb != null) await refreshTmdbMetadata(item);
        else {
          notifyMetadata("info", "collection.details.noExternalId");
          return;
        }
        notifyMetadata("success", "collection.details.metadataRefreshed");
      } catch {
        notifyMetadata("error", "collection.details.metadataRefreshError");
      }
    },
    [notifyMetadata, refreshAniListMetadata, refreshTmdbMetadata]
  );
  const setItemStatus = useCallback(
    (item: CollectionItem, status: CollectionStatus) => {
      const patch: Partial<CollectionItem> = { status };
      if (status === "completed") patch.finishedAt = Date.now();
      if (status === "watching" && !item.startedAt)
        patch.startedAt = Date.now();
      updateItem(item.id, patch);
    },
    [updateItem]
  );
  const [showWizard, setShowWizard] = useState(false);
  const [editingItem, setEditingItem] = useState<CollectionItem | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [detailItem, setDetailItem] = useState<CollectionItem | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showStatusManager, setShowStatusManager] = useState(false);
  const parentRef = useRef<HTMLDivElement>(null);
  const [gridColumns, setGridColumns] = useState(4);
  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? el.clientWidth;
      const cols = Math.max(1, Math.min(8, Math.floor((w + 4) / (CARD_W + 4))));
      setGridColumns((prev) => (prev !== cols ? cols : prev));
    });
    ro.observe(el);
    // initial
    const w = el.clientWidth;
    if (w) {
      const cols = Math.max(1, Math.min(8, Math.floor((w + 4) / (CARD_W + 4))));
      setGridColumns(cols);
    }
    return () => ro.disconnect();
  }, []);

  const searchResults = useCollectionSearch(searchQuery, items);
  const filteredItems = useMemo(
    () =>
      filterCollectionItems(
        items,
        searchResults,
        groupByStatus ? "all" : selectedStatus,
        searchQuery,
        filters,
        sortBy,
        sortDir
      ),
    [
      items,
      searchResults,
      groupByStatus,
      selectedStatus,
      searchQuery,
      filters,
      sortBy,
      sortDir,
    ]
  );

  const stats = useMemo(
    () => calculateCollectionStats(items, statuses),
    [items, statuses]
  );

  const rowVirtualizer = useVirtualizer({
    count: Math.ceil(filteredItems.length / gridColumns),
    getScrollElement: () => parentRef.current,
    estimateSize: () => CARD_H + 8,
    overscan: 2,
  });

  return (
    <StatusMetaContext.Provider value={statuses}>
      <main className="flex h-full w-full flex-col gap-1 overflow-hidden">
        <CollectionToolbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          sortBy={sortBy}
          sortDir={sortDir}
          onSortChange={setSort}
          groupByStatus={groupByStatus}
          onToggleGroupBy={() => setGroupByStatus(!groupByStatus)}
          onToggleFilters={() => setShowFilters((v) => !v)}
          onAdd={() => {
            setEditingItem(null);
            setShowWizard(true);
          }}
          onOpenStatusManager={() => setShowStatusManager(true)}
          onExportJson={dataActions.handleExportJson}
          onExportZip={dataActions.handleExportZip}
          onImportFile={dataActions.handleImportFile}
        />

        {showFilters && (
          <CollectionFiltersPanel filters={filters} setFilters={setFilters} />
        )}

        {activeSection === "library" && !groupByStatus && (
          <CollectionStatusTabs
            statuses={statuses}
            selectedStatus={selectedStatus}
            onSelect={setSelectedStatus}
          />
        )}

        <div className="min-h-0 flex-1 overflow-hidden">
          {activeSection === "statistics" ? (
            <CollectionStatisticsSection stats={stats} />
          ) : groupByStatus ? (
            <CollectionStatusGroups
              items={filteredItems}
              statuses={statuses}
              collapsed={collapsedStatuses}
              onToggleCollapsed={toggleStatusCollapsed}
              onEdit={(item) => {
                setEditingItem(item);
                setShowWizard(true);
              }}
              onOpen={setDetailItem}
              onSetStatus={setItemStatus}
            />
          ) : (
            <CollectionItemsGrid
              items={filteredItems}
              rowVirtualizer={rowVirtualizer}
              scrollRef={parentRef}
              columns={gridColumns}
              onEdit={(item) => {
                setEditingItem(item);
                setShowWizard(true);
              }}
              onOpen={setDetailItem}
              onSetStatus={setItemStatus}
            />
          )}
        </div>

        {showWizard && (
          <WizardModal
            open={showWizard}
            onClose={() => {
              setShowWizard(false);
              setEditingItem(null);
            }}
            onSave={(item) => {
              if (editingItem) updateItem(editingItem.id, item);
              else addItem(item);
            }}
            onDelete={(id) => {
              removeItem(id);
              setShowWizard(false);
              setEditingItem(null);
            }}
            initial={editingItem}
            customFieldDefs={customFieldDefs}
          />
        )}

        {detailItem && (
          <CollectionDetailModal
            item={detailItem}
            reviews={reviews}
            items={items}
            onClose={() => setDetailItem(null)}
            onOpenItem={setDetailItem}
            onEdit={(item) => {
              setEditingItem(item);
              setDetailItem(null);
              setShowWizard(true);
            }}
            onDelete={(id) => {
              setDetailItem(null);
              setPendingDelete(id);
            }}
            updateItem={updateItem}
            refreshMetadata={refreshMetadata}
          />
        )}

        {pendingDelete && (
          <ConfirmDialog
            open
            title={t("collection.deleteMediaTitle")}
            message={t("collection.deleteMediaMessage")}
            confirmLabel={t("common.delete")}
            variant="destructive"
            onConfirm={() => {
              removeItem(pendingDelete);
              setPendingDelete(null);
            }}
            onCancel={() => setPendingDelete(null)}
            onClose={() => setPendingDelete(null)}
          />
        )}
        {dataActions.importStrategyOpen && dataActions.importFile && (
          <SelectDialog
            header={t("collection.import.title")}
            label={t("collection.import.overwriteConfirm")}
            options={[
              { value: "overwrite", label: t("collection.import.overwrite") },
              { value: "skip", label: t("collection.import.skip") },
            ]}
            onSubmit={dataActions.handleConfirmImport}
            onClose={dataActions.handleCloseImport}
          />
        )}
        {showStatusManager && (
          <StatusManagerModal
            statuses={statuses}
            onUpsert={(status) => mutations.upsertStatus(status)}
            onDelete={(id) => mutations.deleteStatus(id)}
            onClose={() => setShowStatusManager(false)}
          />
        )}
      </main>
    </StatusMetaContext.Provider>
  );
}