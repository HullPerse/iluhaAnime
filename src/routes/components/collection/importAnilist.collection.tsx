import { useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";

import Modal from "@/components/shared/modal.component";
import ProgressBar from "@/components/shared/progress.component";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import { COLLECTION_QUERY_KEY, useCollectionData } from "@/lib/collection.queries";
import { anilistStatusToCollection, entryToWizardValues } from "@/lib/collectionImport.utils";
import { buildWizardItem } from "@/lib/collectionWizard.utils";
import { useI18n } from "@/lib/i18n";
import { useNotificationStore } from "@/store/notification.store";
import type { AniListCollection, AniListEntry, AniUser } from "@/types/anilist";

function EntryRow({
  entry,
  checked,
  isDup,
  onToggle,
}: {
  entry: AniListEntry;
  checked: boolean;
  isDup: boolean;
  onToggle: (id: number) => void;
}) {
  const { t } = useI18n();
  const title = entry.media.title;
  return (
    <label
      className={`windows95-border flex cursor-pointer items-center gap-2 p-1 ${checked ? "bg-white" : "bg-primary"} ${isDup ? "opacity-60" : ""}`}
      title={isDup ? t("collection.import.anilistAlreadyExists") : ""}
    >
      <Checkbox checked={checked} onChange={() => onToggle(entry.media.id)} />
      {entry.media.cover_url ? (
        <img
          src={entry.media.cover_url}
          alt=""
          className="windows95-border h-10 w-8 shrink-0 object-cover"
        />
      ) : (
        <div className="bg-surface windows95-border h-10 w-8 shrink-0" />
      )}
      <div className="flex min-w-0 flex-col">
        <span className="windows95-text truncate text-xs font-bold" title={title}>
          {title}
        </span>
        <span className="text-hint truncate text-xs">
          {entry.media.season_year ?? ""} {entry.media.genres?.slice(0, 2).join(", ") ?? ""}
        </span>
        {isDup ? (
          <span className="text-destructive text-xs">duplicate - skip</span>
        ) : (
          <span className="text-hint text-xs">
            → {anilistStatusToCollection(entry.list_status)} | {entry.progress ?? 0}/
            {entry.media.episodes ?? "?"}
          </span>
        )}
      </div>
    </label>
  );
}

export default function ImportAnilistCollection({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { items } = useCollectionData();
  const [user, setUser] = useState<AniUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [lists, setLists] = useState<AniListCollection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [total, setTotal] = useState(0);

  const existingAnilistIds = useMemo(() => {
    const ids = new Set<number>();
    for (const it of items) {
      const aid = it.externalIds.anilist;
      if (typeof aid === "number") ids.add(aid);
    }
    return ids;
  }, [items]);
  const existingTitles = useMemo(() => {
    const titles = new Set<string>();
    for (const it of items) titles.add(it.title.trim().toLocaleLowerCase());
    return titles;
  }, [items]);

  const allEntries = useMemo(() => lists.flatMap((l) => l.entries), [lists]);
  const allIds = useMemo(() => allEntries.map((e) => e.media.id), [allEntries]);

  const isAllSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));

  useEffect(() => {
    if (!open) return;
    setAuthChecked(false);
    setError(null);
    setLists([]);
    setSelected(new Set());
    setProcessed(0);
    setTotal(0);
    invoke<AniUser | null>("check_anilist_auth")
      .then((u) => {
        setUser(u);
        setAuthChecked(true);
        if (!u) return;
        setLoading(true);
        return invoke<AniListCollection[]>("get_anilist_lists", {
          userId: u.id,
        })
          .then((ls) => setLists(ls))
          .catch((e) => setError(String(e)))
          .finally(() => setLoading(false));
      })
      .catch((e) => {
        setError(String(e));
        setAuthChecked(true);
      });
  }, [open]);

  const toggleOne = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleList = (listName: string) => {
    const list = lists.find((l) => l.name === listName);
    if (!list) return;
    const ids = list.entries.map((e) => e.media.id);
    const allInListSelected = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allInListSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const toggleAll = () => {
    if (isAllSelected) setSelected(new Set());
    else setSelected(new Set(allIds));
  };

  const handleImport = async () => {
    const toImport = allEntries.filter(
      (e) =>
        selected.has(e.media.id) &&
        !existingAnilistIds.has(e.media.id) &&
        !existingTitles.has(e.media.title.trim().toLocaleLowerCase())
    );
    if (toImport.length === 0) {
      useNotificationStore
        .getState()
        .add(t("app.collection"), "info", t("collection.import.anilistNoNew"));
      onClose();
      return;
    }
    setImporting(true);
    setProcessed(0);
    setTotal(toImport.length);
    let imported = 0;
    let skipped = 0;
    for (const entry of toImport) {
      const values = entryToWizardValues(entry);
      const item = buildWizardItem(values, null, null);
      const id = crypto.randomUUID();
      const now = Date.now();
      try {
        await invoke("upsert_collection_item", {
          item: {
            id,
            title: item.title,
            altTitles: item.altTitles,
            type: item.type,
            status: item.status,
            progressValue: item.progressValue,
            progressTotal: item.progressTotal,
            progressUnit: item.progressUnit,
            durationMinutes: item.durationMinutes,
            rating: item.rating,
            priority: item.priority,
            isFavorite: item.isFavorite,
            year: item.year,
            genres: item.genres,
            studio: item.studio,
            description: item.description,
            notes: item.notes,
            coverUrl: item.coverUrl,
            coverBlobId: null,
            thumbBlobId: null,
            externalIds: item.externalIds,
            customFields: item.customFields,
            localPath: item.localPath,
            localKind: item.localKind,
            startedAt: item.startedAt,
            finishedAt: item.finishedAt,
            lastWatchedAt: item.lastWatchedAt,
            rewatchCount: item.rewatchCount,
            addedAt: now,
            updatedAt: now,
            sitesToView: item.sitesToView,
            tvCurrentSeason: item.tvCurrentSeason,
            tvCurrentEpisode: item.tvCurrentEpisode,
            detailsJson: item.detailsJson,
          },
        });
        imported++;
      } catch {
        skipped++;
      }
      setProcessed((n) => n + 1);
    }
    const alreadyExisting = allEntries.filter(
      (e) =>
        selected.has(e.media.id) &&
        (existingAnilistIds.has(e.media.id) ||
          existingTitles.has(e.media.title.trim().toLocaleLowerCase()))
    ).length;
    skipped += alreadyExisting;
    setImporting(false);
    await queryClient.invalidateQueries({ queryKey: [COLLECTION_QUERY_KEY] });
    useNotificationStore
      .getState()
      .add(
        t("app.collection"),
        "success",
        t("collection.import.anilistDone", { imported, skipped })
      );
    onImported();
    onClose();
  };

  const selectedCount = selected.size;
  const newCount = allEntries.filter(
    (e) => selected.has(e.media.id) && !existingAnilistIds.has(e.media.id)
  ).length;
  const skipCount = selectedCount - newCount;

  if (!open) return null;

  return (
    <Modal header={t("collection.import.anilistTitle")} onClose={onClose}>
      <div className="flex flex-col gap-3 p-2">
        {!authChecked ? (
          <span className="windows95-text text-xs">{t("common.loading")}</span>
        ) : !user ? (
          <div className="flex flex-col gap-2">
            <span className="windows95-text text-xs">
              {t("collection.import.anilistLoginRequired")}
            </span>
            <span className="text-hint text-xs">{t("collection.import.anilistLoginHint")}</span>
          </div>
        ) : loading ? (
          <span className="windows95-text text-xs">{t("common.loading")}</span>
        ) : error ? (
          <span className="text-destructive windows95-text text-xs">{error}</span>
        ) : lists.length === 0 ? (
          <span className="windows95-text text-xs">{t("collection.import.anilistEmpty")}</span>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <span className="windows95-text text-xs font-bold">
                {t("collection.import.anilistSelected", {
                  selected: selectedCount,
                  total: allIds.length,
                })}
                {skipCount > 0
                  ? ` (${t("collection.import.anilistWillSkip", { count: skipCount })})`
                  : ""}
              </span>
              <Button onClick={toggleAll} disabled={importing}>
                {isAllSelected ? t("common.deselectAll") : t("common.selectAll")}
              </Button>
            </div>

            <div className="windows95-border flex max-h-[50vh] flex-col gap-2 overflow-auto bg-white p-1">
              {lists.map((list) => {
                const ids = list.entries.map((e) => e.media.id);
                const allInList = ids.length > 0 && ids.every((id) => selected.has(id));
                return (
                  <div key={list.name} className="windows95-border bg-primary p-1">
                    <label className="windows95-text flex cursor-pointer items-center gap-2 text-xs font-bold">
                      <Checkbox checked={allInList} onChange={() => toggleList(list.name)} />
                      <span>
                        {list.name} ({list.entries.length})
                      </span>
                      <span className="text-hint text-xs font-normal">
                        {list.entries.filter((e) => selected.has(e.media.id)).length} selected
                      </span>
                    </label>
                    <div className="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-2">
                      {list.entries.map((entry) => (
                        <EntryRow
                          key={entry.media.id}
                          entry={entry}
                          checked={selected.has(entry.media.id)}
                          isDup={
                            existingAnilistIds.has(entry.media.id) ||
                            existingTitles.has(entry.media.title.trim().toLocaleLowerCase())
                          }
                          onToggle={toggleOne}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {importing && (
              <div className="flex flex-col gap-1">
                <ProgressBar value={processed} max={total} />
                <span className="windows95-text text-hint text-xs">
                  {processed}/{total}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="windows95-text text-hint text-xs">
                {t("collection.import.anilistHint")}
              </span>
              <span className="windows95-text text-xs">
                {t("collection.import.anilistNewCount", { count: newCount })}
              </span>
            </div>
          </>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="default" onClick={onClose} disabled={importing}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleImport}
            disabled={!user || selectedCount === 0 || importing || newCount === 0}
          >
            {importing
              ? t("common.loading")
              : t("collection.import.anilistImport", { count: newCount })}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
