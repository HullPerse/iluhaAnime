import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useCollectionDataActions } from "@/hooks/collection/data.hook";
import { useCollectionMetadata } from "@/hooks/collection/metadata.hook";
import {

  useCollectionData,
  useCollectionMutations,
  useCollectionSearch,
} from "@/hooks/collection/queries.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { useSearchField } from "@/hooks/search/field.hook";
import { filterCollectionItems, pickRandomItem } from "@/lib/collection/filter.utils";
import { groupItemsByStatus, shouldGroupByStatus } from "@/lib/collection/group.utils";
import { buildCollectionQueryHints } from "@/lib/collection/hints.utils";
import { buildShareImportPlan } from "@/lib/collection/share.utils";
import { calculateCollectionStats } from "@/lib/collection/stats.utils";
import {
  isPublicStatus,
  isPublicStatusFull,
  publicStatusPrefill,
} from "@/lib/collection/status.utils";
import { useCell } from "@/lib/state/signal.hook";
import { attempt } from "@/lib/utils/attempt.utils";
import { buildCollectionShareLink } from "@/lib/utils/deeplink.utils";
import {
  collectionAtoms,
  consumeWizardPrefill,
  requestWizardPrefill,
  setCollectionFilters,
  setCollectionSearchQuery,
  setCollectionSelectedStatus,
  setCollectionSort,
  toggleCollectionStatusCollapsed,
} from "@/store/collection.store";
import { consumeShareDeepLink, deeplinkAtoms } from "@/store/deeplink.store";
import { addNotification } from "@/store/notification.store";
import { settingsAtoms } from "@/store/settings.store";
import type {
  CollectionItem,
  CollectionStatus,
  CollectionStatusDef,
  WizardPrefill,
} from "@/types/collection";

import FilterCollection from "./components/collection/filter.collection";
import GridCollection from "./components/collection/grid.collection";
import ListCollection from "./components/collection/list.collection";
import CollectionModals from "./components/collection/modals.collection";
import { CollectionQuerySlot } from "./components/collection/querySlot.collection";
import { ShareImportCollection } from "./components/collection/shareImport.collection";
import { StatusCollection } from "./components/collection/status.collection";
import ToolbarCollection from "./components/collection/toolbar.collection";

export default function CollectionRoute() {
  const { t } = useI18n();
  const searchIntentEnabled = useCell(settingsAtoms.searchIntentEnabled);
  const tagTolerances = useCell(settingsAtoms.tagTolerances);
  const { items, statuses, customFieldDefs, isLoading, isError, isFetching, error, refetch } =
    useCollectionData();
  const mutations = useCollectionMutations();
  const dataActions = useCollectionDataActions();
  const shareTarget = useCell(deeplinkAtoms.shareTarget);

  const sortBy = useCell(collectionAtoms.sortBy);
  const sortDir = useCell(collectionAtoms.sortDir);
  const searchQuery = useCell(collectionAtoms.searchQuery);
  const filters = useCell(collectionAtoms.filters);
  const viewMode = useCell(collectionAtoms.viewMode);
  const displayMode = useCell(collectionAtoms.displayMode);
  const selectedStatus = useCell(collectionAtoms.selectedStatus);
  const groupByStatus = useCell(collectionAtoms.groupByStatus);
  const collapsedStatuses = useCell(collectionAtoms.collapsedStatuses);
  const wizardPrefill = useCell(collectionAtoms.wizardPrefill);

  const [showWizard, setShowWizard] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<CollectionItem | null>(null);
  const [wizardDraft, setWizardDraft] = useState<WizardPrefill | null>(null);
  const [detailItem, setDetailItem] = useState<CollectionItem | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [anilistImport, setAnilistImport] = useState<boolean>(false);
  const [statusManager, setStatusManager] = useState<boolean>(false);
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [incomingShare, setIncomingShare] = useState<ReturnType<
    typeof buildShareImportPlan
  > | null>(null);

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

  const collectionExtraValues = useMemo(
    () => buildCollectionQueryHints(items, statuses, t),
    [items, statuses, t]
  );

  const field = useSearchField({
    scope: "filter",
    query: searchQuery,
    setQuery: setCollectionSearchQuery,
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
        sortDir,
        statuses,
        { intentEnabled: searchIntentEnabled, tagTolerances }
      ),
    [
      items,
      searchResults,
      searchQuery,
      selectedStatus,
      filters,
      sortBy,
      sortDir,
      statuses,
      searchIntentEnabled,
      tagTolerances,
    ]
  );

  const statusCounts = useMemo(() => {
    const stats = calculateCollectionStats(items, statuses);
    return { ...stats.byStatus, all: stats.total } as Record<string, number>;
  }, [items, statuses]);
  const addDisabled = isPublicStatusFull(
    statuses,
    selectedStatus,
    statusCounts[selectedStatus] ?? 0
  );
  const selectedIsPublic =
    selectedStatus !== "all" &&
    statuses.some((status) => status.id === selectedStatus && isPublicStatus(status));
  const canShareStatus = selectedIsPublic && (statusCounts[selectedStatus] ?? 0) > 0;

  const grouped = useMemo(
    () =>
      shouldGroupByStatus(groupByStatus, selectedStatus, statuses)
        ? groupItemsByStatus(filtered, statuses)
        : null,
    [groupByStatus, selectedStatus, filtered, statuses]
  );

  const handleAdd = useCallback(() => {
    const prefill = publicStatusPrefill(statuses, selectedStatus);
    if (prefill) {
      requestWizardPrefill(prefill);
      return;
    }
    setEditingItem(null);
    setShowWizard(true);
  }, [statuses, selectedStatus]);

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
  }, [wizardPrefill]);

  const handleStatusManager = useCallback(() => setStatusManager(true), []);
  const handleAnilistImport = useCallback(() => setAnilistImport(true), []);
  const handleRandom = useCallback(() => {
    const pick = pickRandomItem(filtered);
    if (pick) setDetailItem(pick);
  }, [filtered]);

  const handleShareStatus = useCallback(async () => {
    const scopedItems = items.filter((item) => item.status === selectedStatus);
    const label = statuses.find((status) => status.id === selectedStatus)?.label ?? null;
    const [link, linkError] = await attempt(buildCollectionShareLink(scopedItems, label));
    if (linkError) {
      addNotification(t("app.collection"), "error", linkError.message);
      return;
    }
    const [, copyError] = await attempt(writeText(link));
    if (copyError)
      addNotification(t("app.collection"), "error", copyError.message);
  }, [items, selectedStatus, statuses, t]);

  useEffect(() => {
    if (!shareTarget) return;
    setIncomingShare(buildShareImportPlan(shareTarget, statuses));
    consumeShareDeepLink();
  }, [shareTarget, statuses]);

  const handleShareImportClose = useCallback(() => setIncomingShare(null), []);

  const handleAddToStatus = useCallback(
    (status: CollectionStatusDef) => {
      requestWizardPrefill({ title: "", coverUrl: null, status: status.id });
    },
    []
  );

  return (
    <div className="flex h-full w-full flex-col gap-1 overflow-hidden">
      <ToolbarCollection
        handleAdd={handleAdd}
        addDisabled={addDisabled}
        handleStatusManager={handleStatusManager}
        handleAnilistImport={handleAnilistImport}
        handleShowFilters={() => setShowFilters((v) => !v)}
        field={field}
        sortBy={sortBy}
        sortDir={sortDir}
        onSortChange={setCollectionSort}
        onRandom={handleRandom}
        randomDisabled={filtered.length === 0}
      />

      {showFilters && (
        <FilterCollection
          open={showFilters}
          filters={filters}
          onApply={(f) => setCollectionFilters(f)}
          onClose={() => setShowFilters(false)}
        />
      )}

      <StatusCollection
        statuses={statuses}
        selectedStatus={selectedStatus}
        onSelect={setCollectionSelectedStatus}
        counts={statusCounts}
        onShare={canShareStatus ? handleShareStatus : undefined}
      />
      <CollectionQuerySlot
        status={{ isLoading, isFetching, isError, error, refetch }}
        isEmpty={items.length === 0}
      >
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
            onToggleStatusCollapsed={toggleCollectionStatusCollapsed}
            onAddToStatus={handleAddToStatus}
          />
        ) : (
          <ListCollection
            items={filtered}
            statuses={statuses}
            selectedId={detailItem?.id}
            onOpen={setDetailItem}
            onSetStatus={setItemStatus}
            groups={grouped ?? undefined}
            collapsedStatuses={collapsedStatuses}
            onToggleStatusCollapsed={toggleCollectionStatusCollapsed}
            onAddToStatus={handleAddToStatus}
          />
        )}
      </CollectionQuerySlot>
      <CollectionModals
        showWizard={showWizard}
        editingItem={editingItem}
        wizardDraft={wizardDraft}
        statuses={statuses}
        customFieldDefs={customFieldDefs}
        anilistImport={anilistImport}
        detailItem={detailItem}
        items={items}
        pendingDelete={pendingDelete}
        statusManager={statusManager}
        statusCounts={statusCounts}
        showImportStrategy={dataActions.importStrategyOpen && Boolean(dataActions.importFile)}
        onWizardClose={() => {
          setShowWizard(false);
          setEditingItem(null);
          setWizardDraft(null);
        }}
        onWizardSave={(item) => {
          if (editingItem) updateItem(editingItem.id, item);
          else mutations.addItem(item);
          setWizardDraft(null);
        }}
        onWizardDelete={(id) => {
          mutations.removeItem(id);
          setShowWizard(false);
          setEditingItem(null);
        }}
        onImportClose={() => setAnilistImport(false)}
        onDetailClose={() => setDetailItem(null)}
        onOpenItem={setDetailItem}
        onDetailEdit={(item) => {
          setEditingItem(item);
          setDetailItem(null);
          setShowWizard(true);
        }}
        onDetailDelete={(id) => {
          setDetailItem(null);
          setPendingDelete(id);
        }}
        refreshMetadata={refreshMetadata}
        onConfirmDelete={() => {
          if (pendingDelete) {
            mutations.removeItem(pendingDelete);
            setPendingDelete(null);
          }
        }}
        onCancelDelete={() => setPendingDelete(null)}
        onConfirmImport={dataActions.handleConfirmImport}
        onCloseImport={dataActions.handleCloseImport}
        onUpsertStatus={(status) => mutations.upsertStatus(status)}
        onDeleteStatus={(id) => mutations.deleteStatus(id)}
        onStatusManagerClose={() => setStatusManager(false)}
      />
      {incomingShare && (
        <ShareImportCollection plan={incomingShare} onClose={handleShareImportClose} />
      )}
    </div>
  );
}
