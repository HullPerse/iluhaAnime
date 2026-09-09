import { useCallback, useEffect, useMemo, useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm.component";
import { SelectDialog } from "@/components/shared/selectDialog.component";
import { useCollectionDataActions } from "@/hooks/collection/data.hook";
import { useCollectionMetadata } from "@/hooks/collection/metadata.hook";
import {
  useCollectionData,
  useCollectionMutations,
  useCollectionSearch,
} from "@/hooks/collection/queries.hook";
import { useSearchField } from "@/hooks/search/field.hook";
import { filterCollectionItems } from "@/lib/collection/filter.utils";
import { groupItemsByStatus } from "@/lib/collection/group.utils";
import { calculateCollectionStats } from "@/lib/collection/stats.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import { FILTER_KEYS } from "@/lib/search/intent.utils";
import { useCollectionStore } from "@/store/collection.store";
import type { CollectionItem, CollectionStatus, WizardPrefill } from "@/types/collection";

import { DetailCollection } from "./components/collection/detail/modal.detail";
import FilterCollection from "./components/collection/filter.collection";
import GridCollection from "./components/collection/grid.collection";
import ImportAnilistCollection from "./components/collection/importAnilist.collection";
import ListCollection from "./components/collection/list.collection";
import { StatusCollection } from "./components/collection/status.collection";
import { StatusManagerCollection } from "./components/collection/statusManager.collection";
import ToolbarCollection from "./components/collection/toolbar.collection";
import { WizardModal } from "./components/collection/wizard/modal.wizard";

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
    groupByStatus,
    collapsedStatuses,
    toggleStatusCollapsed,
    wizardPrefill,
    consumeWizardPrefill,
  } = useCollectionStore();

  const [showWizard, setShowWizard] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<CollectionItem | null>(null);
  const [wizardDraft, setWizardDraft] = useState<WizardPrefill | null>(null);
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
    for (const key of Object.keys(FILTER_KEYS)) push(`${key}:`);
    for (const by of ["date", "name", "rating"] as const) push(`sort:${by}`);
    for (const provider of ["anilist", "tmdb", "custom"] as const) push(`provider:${provider}`);
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

  const grouped = useMemo(
    () =>
      groupByStatus && selectedStatus === "all" ? groupItemsByStatus(filtered, statuses) : null,
    [groupByStatus, selectedStatus, filtered, statuses]
  );

  const handleAdd = useCallback(() => {
    setEditingItem(null);
    setShowWizard(true);
  }, []);

  const handleEdit = useCallback((item: CollectionItem) => {
    setEditingItem(item);
    setShowWizard(true);
  }, []);
  useEffect(() => {
    if (!wizardPrefill) return;
    setEditingItem(null);
    setWizardDraft(wizardPrefill);
    setShowWizard(true);
    consumeWizardPrefill();
  }, [wizardPrefill, consumeWizardPrefill]);

  const handleStatusManager = useCallback(() => setStatusManager(true), []);
  const handleAnilistImport = useCallback(() => setAnilistImport(true), []);

  return (
    <div className="flex h-full w-full flex-col gap-1 overflow-hidden">
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

      {showFilters && (
        <FilterCollection
          open={showFilters}
          filters={filters}
          onApply={(f) => setFilters(f)}
          onClose={() => setShowFilters(false)}
        />
      )}

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
          display={grouped ? "scroll" : displayMode}
          selectedId={detailItem?.id}
          onOpen={setDetailItem}
          onEdit={handleEdit}
          onSetStatus={setItemStatus}
          groups={grouped ?? undefined}
          collapsedStatuses={collapsedStatuses}
          onToggleStatusCollapsed={toggleStatusCollapsed}
        />
      ) : (
        <ListCollection
          items={filtered}
          statuses={statuses}
          selectedId={detailItem?.id}
          onOpen={setDetailItem}
          onEdit={handleEdit}
          onSetStatus={setItemStatus}
          groups={grouped ?? undefined}
          collapsedStatuses={collapsedStatuses}
          onToggleStatusCollapsed={toggleStatusCollapsed}
        />
      )}
      {showWizard && (
        <WizardModal
          open={showWizard}
          onClose={() => {
            setShowWizard(false);
            setEditingItem(null);
            setWizardDraft(null);
          }}
          onSave={(item) => {
            if (editingItem) updateItem(editingItem.id, item);
            else mutations.addItem(item);
            setWizardDraft(null);
          }}
          onDelete={(id) => {
            mutations.removeItem(id);
            setShowWizard(false);
            setEditingItem(null);
          }}
          initial={editingItem}
          prefill={wizardDraft}
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
    </div>
  );
}
