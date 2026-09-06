import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import { COLLECTION_QUERY_KEY, useCollectionData } from "@/hooks/collection/queries.hook";
import { entryDiffers, entrySyncState, runImportBatch } from "@/lib/collection/import.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import { attempt } from "@/lib/utils/attempt.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { useNotificationStore } from "@/store/notification.store";
import type { AniListCollection, AniListEntry, AniUser } from "@/types/anilist";
import type { CollectionItem, ImportBatchGroup } from "@/types/collection";

import { EntryRow } from "./import/entryRow.import";
import { ImportFooter } from "./import/footer.import";
import { OperationStatus } from "./import/operationStatus.import";
import { ImportStatusSection } from "./import/status.import";
import { SyncRow } from "./import/syncRow.import";

type ImportMode = "summary" | "import" | "sync" | "backfill";

const ANIME_META = {
  title: "",
  duration: null as number | null,
  episodes: null as number | null,
  genres: [] as string[],
  studios: [] as { name: string }[],
  cover_url: null as string | null,
  season_year: null as number | null,
};

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
  const { items, statuses } = useCollectionData();
  const [user, setUser] = useState<AniUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [lists, setLists] = useState<AniListCollection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ImportMode>("summary");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [batch, setBatch] = useState<ImportBatchGroup[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [importFailures, setImportFailures] = useState<Array<{ id: number; title: string }>>([]);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [opProcessed, setOpProcessed] = useState(0);
  const [opCurrent, setOpCurrent] = useState<string | null>(null);
  const [opFailures, setOpFailures] = useState<Array<{ id: string; title: string }>>([]);
  const [opDone, setOpDone] = useState<{ ok: number } | null>(null);
  const abortRef = useRef(false);

  const statusById = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses]);
  const statusLabel = (id: string) => statusById.get(id)?.label ?? id;

  const itemByAnilistId = useMemo(() => {
    const map = new Map<number, CollectionItem>();
    for (const item of items) {
      if (item.externalIds.anilist != null) map.set(item.externalIds.anilist, item);
    }
    return map;
  }, [items]);

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
  const newEntries = useMemo(
    () =>
      allEntries.filter(
        (e) =>
          !existingAnilistIds.has(e.media.id) &&
          !existingTitles.has(e.media.title.trim().toLocaleLowerCase())
      ),
    [allEntries, existingAnilistIds, existingTitles]
  );
  const changedEntries = useMemo(
    () =>
      allEntries.filter((e) => {
        const item = itemByAnilistId.get(e.media.id);
        return item !== undefined && entryDiffers(e, item);
      }),
    [allEntries, itemByAnilistId]
  );
  const existingCount = allEntries.length - newEntries.length;
  const backfillTargets = useMemo(
    () => items.filter((item) => item.externalIds.anilist != null),
    [items]
  );

  useEffect(() => {
    if (!open) return;
    setAuthChecked(false);
    setError(null);
    setLists([]);
    setSelected(new Set());
    setMode("summary");
    setProcessed(0);
    setBatch([]);
    setCurrent(null);
    setImportFailures([]);
    setResult(null);
    setRunning(false);
    setOpFailures([]);
    setOpDone(null);
    abortRef.current = false;
    invokeTyped<AniUser | null>("check_anilist_auth")
      .then((u) => {
        setUser(u);
        setAuthChecked(true);
        if (!u) return;
        setLoading(true);
        return invokeTyped<AniListCollection[]>("get_anilist_lists", {
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

  const switchMode = (next: ImportMode) => {
    setSelected(new Set());
    setImportFailures([]);
    setResult(null);
    setOpFailures([]);
    setOpDone(null);
    setMode(next);
  };

  const toggleOne = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = (entries: AniListEntry[]) => {
    const ids = entries.map((e) => e.media.id);
    const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const notify = (
    type: "success" | "error" | "info",
    key: string,
    vars?: Record<string, unknown>
  ) => {
    useNotificationStore.getState().add(t("app.collection"), type, t(key as never, vars as never));
  };

  const importEntries = async (entries: AniListEntry[]) => {
    setImporting(true);
    setBatch([]);
    const outcome = await runImportBatch(
      entries,
      () => abortRef.current,
      (done, title) => {
        setProcessed(done);
        setCurrent(title === "" ? null : title);
      }
    );
    setImporting(false);
    return outcome;
  };

  const finishImport = async (imported: number, failedCount: number) => {
    await queryClient.invalidateQueries({ queryKey: [COLLECTION_QUERY_KEY] });
    setResult({ imported, skipped: 0 });
    notify(failedCount > 0 ? "error" : "success", "collection.import.anilist.done", {
      imported,
      skipped: 0,
    });
    onImported();
  };

  const handleImport = async () => {
    const toImport = newEntries.filter((e) => selected.has(e.media.id));
    if (toImport.length === 0) {
      notify("info", "collection.import.anilist.no.new");
      onClose();
      return;
    }
    abortRef.current = false;
    setImportFailures([]);
    setResult(null);
    const { imported, failed } = await importEntries(toImport);
    setImportFailures(failed);
    await finishImport(imported, failed.length);
  };

  const retryImport = async () => {
    const entries = importFailures
      .map((f) => newEntries.find((e) => e.media.id === f.id))
      .filter((e): e is AniListEntry => e !== undefined);
    if (entries.length === 0) return;
    abortRef.current = false;
    setImportFailures([]);
    const { imported, failed } = await importEntries(entries);
    setImportFailures(failed);
    setResult((prev) => ({
      imported: (prev?.imported ?? 0) + imported,
      skipped: 0,
    }));
    await queryClient.invalidateQueries({ queryKey: [COLLECTION_QUERY_KEY] });
    onImported();
  };

  const changeTextFor = (entry: AniListEntry, item: CollectionItem): string => {
    const s = entrySyncState(entry);
    const parts: string[] = [];
    if (s.status !== item.status)
      parts.push(
        t("collection.import.anilist.change.status", {
          from: statusLabel(item.status),
          to: statusLabel(s.status),
        })
      );
    if (s.progressValue !== item.progressValue)
      parts.push(
        t("collection.import.anilist.change.progress", {
          from: item.progressValue,
          to: s.progressValue,
        })
      );
    if (s.rating !== item.rating)
      parts.push(
        t("collection.import.anilist.change.rating", {
          from: item.rating ?? "—",
          to: s.rating ?? "—",
        })
      );
    return parts.join(" · ");
  };

  const syncTargets = changedEntries
    .filter((e) => selected.has(e.media.id))
    .map((e) => ({ entry: e, item: itemByAnilistId.get(e.media.id)! }));

  const runSync = async (targets: Array<{ entry: AniListEntry; item: CollectionItem }>) => {
    setRunning(true);
    setOpFailures([]);
    setOpDone(null);
    setOpProcessed(0);
    const failed: Array<{ id: string; title: string }> = [];
    let ok = 0;
    for (const { entry, item } of targets) {
      if (abortRef.current) break;
      setOpCurrent(entry.media.title);
      const s = entrySyncState(entry);
      const [, err] = await attempt(
        invokeTyped("patch_collection_item", {
          id: item.id,
          patch: { status: s.status, progressValue: s.progressValue, rating: s.rating },
        })
      );
      if (err) failed.push({ id: item.id, title: entry.media.title });
      else ok += 1;
      setOpProcessed((p) => p + 1);
    }
    setRunning(false);
    setOpFailures(failed);
    setOpDone({ ok });
    await queryClient.invalidateQueries({ queryKey: [COLLECTION_QUERY_KEY] });
    notify(failed.length > 0 ? "error" : "success", "collection.import.anilist.sync.done", {
      count: ok,
    });
    onImported();
  };

  const retrySync = () => {
    const failedIds = new Set(opFailures.map((f) => f.id));
    const targets = changedEntries
      .filter((e) => {
        const item = itemByAnilistId.get(e.media.id);
        return item !== undefined && failedIds.has(item.id);
      })
      .map((e) => ({ entry: e, item: itemByAnilistId.get(e.media.id)! }));
    runSync(targets).catch(() => undefined);
  };

  const runBackfill = async (targets: CollectionItem[]) => {
    setRunning(true);
    setOpFailures([]);
    setOpDone(null);
    setOpProcessed(0);
    const failed: Array<{ id: string; title: string }> = [];
    let ok = 0;
    for (const item of targets) {
      if (abortRef.current) break;
      setOpCurrent(item.title);
      const [m, err] = await attempt(
        invokeTyped<typeof ANIME_META>("get_anime_by_id", { id: item.externalIds.anilist })
      );
      if (err || !m) {
        failed.push({ id: item.id, title: item.title });
      } else {
        const [, patchErr] = await attempt(
          invokeTyped("patch_collection_item", {
            id: item.id,
            patch: {
              title: m.title || item.title,
              durationMinutes: m.duration ?? item.durationMinutes,
              progressTotal: m.episodes ?? item.progressTotal,
              genres: m.genres.length ? m.genres : item.genres,
              studio: m.studios[0]?.name ?? item.studio,
              coverUrl: m.cover_url ?? item.coverUrl,
              year: m.season_year ?? item.year,
            },
          })
        );
        if (patchErr) failed.push({ id: item.id, title: item.title });
        else ok += 1;
      }
      setOpProcessed((p) => p + 1);
    }
    setRunning(false);
    setOpFailures(failed);
    setOpDone({ ok });
    await queryClient.invalidateQueries({ queryKey: [COLLECTION_QUERY_KEY] });
    notify(failed.length > 0 ? "error" : "success", "collection.import.anilist.metadata.done", {
      count: ok,
    });
    onImported();
  };

  const retryBackfill = () => {
    const failedIds = new Set(opFailures.map((f) => f.id));
    runBackfill(backfillTargets.filter((item) => failedIds.has(item.id))).catch(() => undefined);
  };

  const selectedCount = selected.size;
  const selectedNew = newEntries.filter((e) => selected.has(e.media.id)).length;
  const allChangedSelected =
    changedEntries.length > 0 && changedEntries.every((e) => selected.has(e.media.id));

  if (!open) return null;

  const renderSummary = () => (
    <div className="flex flex-col gap-2">
      <div className="windows95-border flex flex-col gap-1 bg-white p-2">
        <span className="windows95-text text-xs font-bold">
          {t("collection.import.anilist.summary.new", { count: newEntries.length })}
        </span>
        <span className="windows95-text text-xs font-bold">
          {t("collection.import.anilist.summary.changed", { count: changedEntries.length })}
        </span>
        <span className="windows95-text text-hint text-xs">
          {t("collection.import.anilist.summary.existing", { count: existingCount })}
        </span>
        {newEntries.length === 0 && changedEntries.length === 0 && (
          <span className="text-hint text-xs">{t("collection.import.anilist.up.to.date")}</span>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <Button onClick={() => switchMode("import")} disabled={newEntries.length === 0}>
          {t("collection.import.anilist.import.action", { count: newEntries.length })}
        </Button>
        <Button onClick={() => switchMode("sync")} disabled={changedEntries.length === 0}>
          {t("collection.import.anilist.sync.action", { count: changedEntries.length })}
        </Button>
        <Button onClick={() => switchMode("backfill")} disabled={backfillTargets.length === 0}>
          {t("collection.import.anilist.metadata.action")}
        </Button>
      </div>
    </div>
  );

  const renderImport = () => (
    <>
      <div className="flex items-center justify-between">
        <span className="windows95-text text-xs font-bold">
          {t("collection.import.anilist.selected", {
            selected: selectedNew,
            total: newEntries.length,
          })}
        </span>
        <Button onClick={() => toggleAll(newEntries)} disabled={importing}>
          {selectedNew === newEntries.length && newEntries.length > 0
            ? t("common.deselect.all")
            : t("common.select.all")}
        </Button>
      </div>

      <div className="windows95-border flex max-h-[50vh] flex-col gap-2 overflow-auto bg-white p-1">
        {lists.map((list) => {
          const ids = list.entries
            .filter((e) => newEntries.some((n) => n.media.id === e.media.id))
            .map((e) => e.media.id);
          const allInList = ids.length > 0 && ids.every((id) => selected.has(id));
          return (
            <div key={list.name} className="windows95-border bg-primary p-1">
              <label className="windows95-text flex cursor-pointer items-center gap-2 text-xs font-bold select-none">
                <Checkbox
                  checked={allInList}
                  onChange={() => toggleAll(list.entries.filter((e) => ids.includes(e.media.id)))}
                />
                <span>
                  {list.name} ({ids.length})
                </span>
              </label>
              <div className="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-2">
                {list.entries
                  .filter((e) => newEntries.some((n) => n.media.id === e.media.id))
                  .map((entry) => (
                    <EntryRow
                      key={entry.media.id}
                      entry={entry}
                      checked={selected.has(entry.media.id)}
                      isDup={false}
                      onToggle={toggleOne}
                    />
                  ))}
              </div>
            </div>
          );
        })}
      </div>

      <ImportStatusSection
        importing={importing}
        processed={processed}
        result={result}
        failures={importFailures}
        groups={batch}
        profileTotal={newEntries.length}
        current={current}
      />

      <ImportFooter
        canImport={selectedNew > 0}
        importing={importing}
        importLabel={t("collection.import.anilist.import", { count: selectedNew })}
        showRetry={!importing && importFailures.length > 0}
        onCancel={() => {
          if (importing) abortRef.current = true;
          else onClose();
        }}
        onRetry={() => {
          retryImport().catch(() => undefined);
        }}
        onImport={() => {
          handleImport().catch(() => undefined);
        }}
      />
    </>
  );

  const renderSync = () => (
    <>
      {!running && (
        <Button variant="ghost" className="w-fit text-xs" onClick={() => switchMode("summary")}>
          {t("collection.import.anilist.back")}
        </Button>
      )}

      <div className="flex flex-col gap-1">
        <span className="windows95-text text-xs font-bold">
          {t("collection.import.anilist.summary.changed", { count: changedEntries.length })}
        </span>
        <span className="text-hint text-xs">{t("collection.import.anilist.sync.hint")}</span>
      </div>

      <div className="windows95-border flex max-h-[50vh] flex-col gap-1 overflow-auto bg-white p-1">
        {changedEntries.map((entry) => {
          const item = itemByAnilistId.get(entry.media.id)!;
          return (
            <SyncRow
              key={entry.media.id}
              entry={entry}
              checked={selected.has(entry.media.id)}
              changeText={changeTextFor(entry, item)}
              onToggle={toggleOne}
            />
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <span className="windows95-text text-hint text-xs">
          {t("collection.import.anilist.selected", {
            selected: selectedCount,
            total: changedEntries.length,
          })}
        </span>
        <Button onClick={() => toggleAll(changedEntries)} disabled={running}>
          {allChangedSelected ? t("common.deselect.all") : t("common.select.all")}
        </Button>
      </div>

      <OperationStatus
        running={running}
        processed={opProcessed}
        total={changedEntries.length}
        current={opCurrent}
        doneLabel="collection.import.anilist.sync.done"
        doneCount={opDone?.ok ?? null}
        failures={opFailures}
      />

      <ImportFooter
        canImport={selectedCount > 0}
        importing={running}
        importLabel={t("collection.import.anilist.sync.action", { count: selectedCount })}
        showRetry={!running && opFailures.length > 0}
        onCancel={() => {
          if (running) abortRef.current = true;
          else onClose();
        }}
        onRetry={retrySync}
        onImport={() => {
          runSync(syncTargets).catch(() => undefined);
        }}
      />
    </>
  );

  const renderBackfill = () => (
    <>
      {!running && (
        <Button variant="ghost" className="w-fit text-xs" onClick={() => switchMode("summary")}>
          {t("collection.import.anilist.back")}
        </Button>
      )}

      <div className="flex flex-col gap-1">
        <span className="windows95-text text-xs font-bold">
          {t("collection.import.anilist.metadata.title")}
        </span>
        <span className="text-hint text-xs">
          {t("collection.import.anilist.metadata.hint", { count: backfillTargets.length })}
        </span>
      </div>

      <OperationStatus
        running={running}
        processed={opProcessed}
        total={backfillTargets.length}
        current={opCurrent}
        doneLabel="collection.import.anilist.metadata.done"
        doneCount={opDone?.ok ?? null}
        failures={opFailures}
      />

      <ImportFooter
        canImport={backfillTargets.length > 0}
        importing={running}
        importLabel={t("collection.import.anilist.metadata.start", {
          count: backfillTargets.length,
        })}
        showRetry={!running && opFailures.length > 0}
        onCancel={() => {
          if (running) abortRef.current = true;
          else onClose();
        }}
        onRetry={retryBackfill}
        onImport={() => {
          runBackfill(backfillTargets).catch(() => undefined);
        }}
      />
    </>
  );

  return (
    <Modal
      header={t("collection.import.anilist.title")}
      onClose={() => {
        if (!importing && !running) onClose();
      }}
    >
      <div className="flex flex-col gap-3 p-2">
        {!authChecked ? (
          <span className="windows95-text text-xs">{t("common.loading")}</span>
        ) : !user ? (
          <div className="flex flex-col gap-2">
            <span className="windows95-text text-xs">
              {t("collection.import.anilist.login.required")}
            </span>
            <span className="text-hint text-xs">{t("collection.import.anilist.login.hint")}</span>
          </div>
        ) : loading ? (
          <span className="windows95-text text-xs">{t("common.loading")}</span>
        ) : error ? (
          <span className="text-destructive windows95-text text-xs">{error}</span>
        ) : lists.length === 0 ? (
          <span className="windows95-text text-xs">{t("collection.import.anilist.empty")}</span>
        ) : mode === "summary" ? (
          renderSummary()
        ) : mode === "import" ? (
          renderImport()
        ) : mode === "sync" ? (
          renderSync()
        ) : (
          renderBackfill()
        )}
      </div>
    </Modal>
  );
}
