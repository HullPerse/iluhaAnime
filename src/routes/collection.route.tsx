import { useCallback, useMemo, useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm.component";
import { SelectDialog } from "@/components/shared/prompt.component";
import { useCollectionDataActions } from "@/hooks/collectionData.hook";
import { useCollectionMetadata } from "@/hooks/collectionMetadata.hook";
import { useSearchField } from "@/hooks/searchField.hook";
import { DEFAULT_FILTERS } from "@/lib/collection.filters";
import {
  useCollectionData,
  useCollectionMutations,
  useCollectionSearch,
} from "@/lib/collection.queries";
import { filterCollectionItems } from "@/lib/collectionFilter.utils";
import { calculateCollectionStats } from "@/lib/collectionStats.utils";
import { useI18n } from "@/lib/i18n";
import { useCollectionStore } from "@/store/collection.store";
import type { CollectionItem, CollectionStatus } from "@/types/collection";

import { DetailCollection } from "./components/collection/detail.collection";
import FilterCollection from "./components/collection/filter.collection";
import GridCollection from "./components/collection/grid.collection";
import ImportAnilistCollection from "./components/collection/importAnilist.collection";
import ListCollection from "./components/collection/list.collection";
import { StatusCollection } from "./components/collection/status.collection";
import { StatusManagerCollection } from "./components/collection/statusManager.collection";
import ToolbarCollection from "./components/collection/toolbar.collection";
import { WizardModalCollection } from "./components/collection/wizard/modal.wizard";

export default function CollectionRoute() {
  const { items, statuses, customFieldDefs } = useCollectionData();
  const mutations = useCollectionMutations();
  const dataActions = useCollectionDataActions();
  const { t } = useI18n();

  const {
    sortBy,
    sortDir,
    setSort,
    searchQuery,
    setSearchQuery,
    filters,
    setFilters,
    viewMode,
    displayMode,
    selectedStatus,
    setSelectedStatus,
  } = useCollectionStore();

  const [showWizard, setShowWizard] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<CollectionItem | null>(null);
  const [detailItem, setDetailItem] = useState<CollectionItem | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [anilistImport, setAnilistImport] = useState<boolean>(false);
  const [statusManager, setStatusManager] = useState<boolean>(false);
  const [showFilters, setShowFilters] = useState<boolean>(false);

  const updateItem = useCallback(
    (id: string, patch: Partial<CollectionItem>) => mutations.updateItem(id, patch),
    [mutations]
  );
  const { refreshMetadata } = useCollectionMetadata(updateItem);

  const setItemStatus = useCallback(
    (item: CollectionItem, status: CollectionStatus) => {
      const patch: Partial<CollectionItem> = { status };
      if (status === "completed") patch.finishedAt = Date.now();
      if (status === "watching" && !item.startedAt) patch.startedAt = Date.now();
      updateItem(item.id, patch);
    },
    [updateItem]
  );

  const collectionSuggestionItems = useMemo(
    () =>
      items.map((item) => ({
        title: item.title,
        altTitles: item.altTitles,
        subtitle: item.status,
      })),
    [items]
  );

  const collectionExtraValues = useMemo<Array<{ kind: "local"; value: string }>>(() => {
    const hints: Array<{ kind: "local"; value: string }> = [];
    const push = (value: string) => hints.push({ kind: "local", value });
    push("source:anilist");
    push("source:tmdb");
    push("source:custom");
    push("type:anime");
    push("type:movie");
    push("type:series");
    push("type:custom");
    for (const s of statuses) push(`status:${s.id}`);
    for (const p of ["low", "normal", "high"] as const) push(`priority:${p}`);
    const studios = new Set<string>();
    const genres = new Set<string>();
    const years = new Set<string>();
    const ratings = new Set<string>();
    for (const item of items) {
      if (item.studio) studios.add(item.studio);
      for (const g of item.genres) if (g) genres.add(g);
      if (item.year != null) years.add(String(item.year));
      if (item.rating != null) ratings.add(String(item.rating));
    }
    for (const v of studios) push(`studio:${v}`);
    for (const v of genres) push(`genre:${v}`);
    for (const v of years) push(`year:${v}`);
    for (const v of ratings) push(`rating:${v}`);
    return hints;
  }, [items, statuses]);

  const field = useSearchField({
    scope: "filter",
    query: searchQuery,
    setQuery: setSearchQuery,
    collectionItems: collectionSuggestionItems,
    extraValues: collectionExtraValues,
    historyScope: "filter",
  });

  const searchResults = useCollectionSearch(searchQuery, items);

  const filtered = useMemo(
    () =>
      filterCollectionItems(
        items,
        searchResults,
        selectedStatus,
        searchQuery,
        filters,
        sortBy,
        sortDir
      ),
    [items, searchResults, searchQuery, selectedStatus, filters, sortBy, sortDir]
  );

  const statusCounts = useMemo(() => {
    const stats = calculateCollectionStats(items, statuses);
    return { ...stats.byStatus, all: stats.total } as Record<string, number>;
  }, [items, statuses]);

  const handleAdd = useCallback(() => {
    setEditingItem(null);
    setShowWizard(true);
  }, []);

  const handleEdit = useCallback((item: CollectionItem) => {
    setEditingItem(item);
    setShowWizard(true);
  }, []);

  const handleStatusManager = useCallback(() => setStatusManager(true), []);
  const handleAnilistImport = useCallback(() => setAnilistImport(true), []);

  return (
    <main className="flex h-full w-full flex-col gap-1 overflow-hidden">
      <ToolbarCollection
        handleAdd={handleAdd}
        handleStatusManager={handleStatusManager}
        handleAnilistImport={handleAnilistImport}
        handleShowFilters={() => setShowFilters((v) => !v)}
        field={field}
        sortBy={sortBy}
        sortDir={sortDir}
        onSortChange={setSort}
      />

      <FilterCollection
        open={showFilters}
        filters={filters}
        onApply={(f) => setFilters(f)}
        onReset={() => setFilters({ ...DEFAULT_FILTERS, mediaTypes: [], genres: [] })}
        onClose={() => setShowFilters(false)}
      />

      <StatusCollection
        statuses={statuses}
        selectedStatus={selectedStatus}
        onSelect={setSelectedStatus}
        counts={statusCounts}
      />

      {viewMode === "grid" ? (
        <GridCollection
          items={filtered}
          statuses={statuses}
          display={displayMode}
          onOpen={setDetailItem}
          onEdit={handleEdit}
          onSetStatus={setItemStatus}
        />
      ) : (
        <ListCollection
          items={filtered}
          statuses={statuses}
          onOpen={setDetailItem}
          onEdit={handleEdit}
          onSetStatus={setItemStatus}
        />
      )}

      {showWizard && (
        <WizardModalCollection
          open={showWizard}
          onClose={() => {
            setShowWizard(false);
            setEditingItem(null);
          }}
          onSave={(item) => {
            if (editingItem) updateItem(editingItem.id, item);
            else mutations.addItem(item);
          }}
          onDelete={(id) => {
            mutations.removeItem(id);
            setShowWizard(false);
            setEditingItem(null);
          }}
          initial={editingItem}
          statuses={statuses}
          customFieldDefs={customFieldDefs}
        />
      )}
      {anilistImport && (
        <ImportAnilistCollection
          open={anilistImport}
          onClose={() => setAnilistImport(false)}
          onImported={() => {}}
        />
      )}

      {detailItem && (
        <DetailCollection
          item={detailItem}
          items={items}
          statuses={statuses}
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
          title={t("collection.delete.media.title")}
          message={t("collection.delete.media.message")}
          confirmLabel={t("common.delete")}
          variant="destructive"
          onConfirm={() => {
            mutations.removeItem(pendingDelete);
            setPendingDelete(null);
          }}
          onCancel={() => setPendingDelete(null)}
          onClose={() => setPendingDelete(null)}
        />
      )}
      {dataActions.importStrategyOpen && dataActions.importFile && (
        <SelectDialog
          header={t("collection.import.title")}
          label={t("collection.import.overwrite.confirm")}
          options={[
            { value: "overwrite", label: t("collection.import.overwrite") },
            { value: "skip", label: t("collection.import.skip") },
          ]}
          onSubmit={dataActions.handleConfirmImport}
          onClose={dataActions.handleCloseImport}
        />
      )}
      {statusManager && (
        <StatusManagerCollection
          statuses={statuses}
          onUpsert={(status) => mutations.upsertStatus(status)}
          onDelete={(id) => mutations.deleteStatus(id)}
          onClose={() => setStatusManager(false)}
        />
      )}
    </main>
  );
}
