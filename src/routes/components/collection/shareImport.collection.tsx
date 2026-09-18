import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { useRef, useState } from "react";

import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import Image from "@/components/ui/image.component";
import { Input } from "@/components/ui/input.component";
import { DEFAULT_NEW_COLOR, PUBLIC_STATUS_MAX_ITEMS } from "@/config/collection/statuses.config";
import { COLLECTION_QUERY_KEY } from "@/hooks/collection/queries.hook";
import { useRemoteImage } from "@/hooks/remoteImage.hook";
import {
  buildCustomStatusId,
  normalizeStatusLabel,
  resolveStatusLabel,
} from "@/lib/collection/status.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import { attempt } from "@/lib/utils/attempt.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { useNotificationStore } from "@/store/notification.store";
import type { ShareImportPlan } from "@/types/deeplink";

import { BilingualPreview } from "./bilingualPreview.collection";
import { OperationStatus } from "./import/operationStatus.import";

/**
 * Every imported item is written into the public status instead of the status it had on
 * the sender's side, so the whole collection arrives as one removable bucket.
 */
function shareRowToExportRow(row: ShareImportPlan["rows"][number], status: string) {
  return {
    id: "",
    title: row.snapshot.title,
    altTitles: [],
    type: row.snapshot.type,
    status,
    progressValue: 0,
    progressTotal: null,
    progressUnit: "episodes",
    durationMinutes: null,
    rating: null,
    priority: "normal",
    isFavorite: false,
    year: row.snapshot.year,
    releaseDate: null,
    genres: [],
    studio: null,
    description: null,
    notes: null,
    coverUrl: row.snapshot.coverUrl,
    coverBlobId: null,
    thumbBlobId: null,
    externalIds: row.snapshot.externalIds,
    customFields: {},
    localPath: null,
    localKind: null,
    startedAt: null,
    finishedAt: null,
    lastWatchedAt: null,
    rewatchCount: 0,
    addedAt: 0,
    updatedAt: 0,
    sitesToView: [],
    tvCurrentSeason: null,
    tvCurrentEpisode: null,
    detailsJson: null,
  };
}

export function ShareImportCollection({
  plan,
  onClose,
}: {
  plan: ShareImportPlan;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  // The status label is capped at 64 chars server side, so a longer shared label is trimmed.
  const [name, setName] = useState((plan.link.label ?? "").slice(0, 64));
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(plan.rows.map((_, index) => index).slice(0, PUBLIC_STATUS_MAX_ITEMS))
  );
  const [importing, setImporting] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [runTotal, setRunTotal] = useState(0);
  const [current, setCurrent] = useState<string | null>(null);
  const [failures, setFailures] = useState<Array<{ id: string; title: string }>>([]);
  const [failedIndices, setFailedIndices] = useState<number[]>([]);
  const [imported, setImported] = useState<number | null>(null);
  const statusIdRef = useRef<string | null>(null);
  const abortRef = useRef(false);

  const label = normalizeStatusLabel(name);
  const sharedLabel = resolveStatusLabel(plan.link.label ?? "", locale);
  const atCap = selected.size >= PUBLIC_STATUS_MAX_ITEMS;
  const overflow = plan.rows.length - PUBLIC_STATUS_MAX_ITEMS;
  const existingTarget = plan.statuses.find(
    (status) => status.kind === "public" && status.label.toLowerCase() === label.toLowerCase()
  );
  const canImport = label !== "" && selected.size > 0 && !importing;

  const toggleRow = (index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else if (next.size < PUBLIC_STATUS_MAX_ITEMS) next.add(index);
      return next;
    });
  };

  /** Creates the public status once, then reuses it for retries. */
  const resolveStatusId = async () => {
    if (statusIdRef.current !== null) return statusIdRef.current;
    if (existingTarget) {
      statusIdRef.current = existingTarget.id;
      return existingTarget.id;
    }
    const order = plan.statuses.reduce((max, status) => Math.max(max, status.order), 0) + 1;
    const id = buildCustomStatusId(label);
    await invokeTyped("upsert_collection_status", {
      status: {
        id,
        label,
        color: DEFAULT_NEW_COLOR,
        orderIndex: order,
        isCore: false,
        kind: "public",
      },
    });
    statusIdRef.current = id;
    return id;
  };

  const runImport = async (indices: number[]) => {
    setImporting(true);
    setFailures([]);
    setProcessed(0);
    setRunTotal(indices.length);
    setImported(null);
    abortRef.current = false;
    const [, error] = await attempt(
      (async () => {
        const statusId = await resolveStatusId();
        let ok = 0;
        const failed: Array<{ id: string; title: string }> = [];
        const failedIds: number[] = [];
        for (const index of indices) {
          if (abortRef.current) break;
          const row = plan.rows[index];
          if (!row) continue;
          setCurrent(row.snapshot.title);
          const [, importError] = await attempt(
            invokeTyped("import_collection_data", {
              data: {
                version: 1,
                exportedAt: Math.floor(Date.now() / 1000),
                items: [shareRowToExportRow(row, statusId)],
                customFieldDefs: [],
              },
              strategy: "create_new",
            })
          );
          if (importError) {
            failed.push({ id: String(index), title: row.snapshot.title });
            failedIds.push(index);
          } else {
            ok += 1;
          }
          setProcessed((done) => done + 1);
        }
        setFailures(failed);
        setFailedIndices(failedIds);
        setImported(ok);
        setCurrent(null);
        await queryClient.invalidateQueries({ queryKey: [COLLECTION_QUERY_KEY] });
      })()
    );
    if (error)
      useNotificationStore.getState().add(t("app.collection"), "error", error.message);
    setImporting(false);
  };

  return (
    <Modal
      header={t("collection.share.preview.title")}
      onClose={() => {
        if (!importing) onClose();
      }}
      className="w-130"
      contentClassName="w-full"
    >
      <div className="flex w-full flex-col gap-1.5">
        <p className="windows95-text text-xs">
          {t("collection.share.preview.from", {
            count: plan.rows.length,
            label: sharedLabel === "" ? t("collection.share.preview.unnamed") : sharedLabel,
          })}
        </p>

        <div className="windows95-border flex flex-wrap items-center gap-1 p-1">
          <span className="windows95-text shrink-0 text-xs font-bold">
            {t("collection.share.preview.name")}
          </span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("collection.share.preview.name.placeholder")}
            aria-label={t("collection.share.preview.name")}
            className="h-5 min-w-24 flex-1 text-xs"
            maxLength={64}
            spellCheck={false}
            disabled={importing}
          />
          <BilingualPreview value={name} />
        </div>

        <p className="text-hint windows95-font text-xs">
          {label === ""
            ? t("collection.share.preview.name.required")
            : t(
                existingTarget
                  ? "collection.share.preview.target.existing"
                  : "collection.share.preview.target.new",
                { label, max: String(PUBLIC_STATUS_MAX_ITEMS) }
              )}
        </p>

        <div className="flex items-center justify-between gap-1">
          <span className="windows95-text text-xs font-bold">
            {t("collection.share.preview.selected", {
              selected: selected.size,
              total: plan.rows.length,
            })}
          </span>
          <Button
            onClick={() =>
              setSelected(
                selected.size > 0
                  ? new Set()
                  : new Set(plan.rows.map((_, index) => index).slice(0, PUBLIC_STATUS_MAX_ITEMS))
              )
            }
            disabled={importing}
          >
            {selected.size > 0 ? t("common.deselect.all") : t("common.select.all")}
          </Button>
        </div>

        <ul className="windows95-border bg-surface flex max-h-[45vh] flex-col gap-1 overflow-y-auto p-1">
          {plan.rows.map((row, index) => (
            <ShareImportRow
              key={`${row.snapshot.title}-${index}`}
              row={row}
              index={index}
              checked={selected.has(index)}
              importing={importing}
              atCap={atCap}
              onToggle={toggleRow}
            />
          ))}
        </ul>

        {overflow > 0 && (
          <p className="text-hint windows95-font flex items-center gap-1 text-xs">
            <AlertTriangle className="size-3 shrink-0" aria-hidden />
            {t("collection.share.preview.cap", {
              count: overflow,
              max: String(PUBLIC_STATUS_MAX_ITEMS),
            })}
          </p>
        )}

        <OperationStatus
          running={importing}
          processed={processed}
          total={Math.max(runTotal, 1)}
          current={current}
          doneLabel="collection.share.preview.done"
          doneCount={imported}
          failures={failures}
        />

        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            onClick={() => {
              if (importing) abortRef.current = true;
              else onClose();
            }}
          >
            {imported === null ? t("common.cancel") : t("common.close")}
          </Button>
          {!importing && failedIndices.length > 0 && (
            <Button onClick={() => attempt(runImport(failedIndices))}>
              {t("collection.import.anilist.retry.failed")}
            </Button>
          )}
          {imported === null && (
            <Button
              variant="success"
              disabled={!canImport}
              onClick={() => attempt(runImport([...selected]))}
            >
              {importing
                ? t("common.loading")
                : t("collection.share.preview.import", { count: selected.size })}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function ShareImportRow({
  row,
  index,
  checked,
  importing,
  atCap,
  onToggle,
}: {
  row: ShareImportPlan["rows"][number];
  index: number;
  checked: boolean;
  importing: boolean;
  atCap: boolean;
  onToggle: (index: number) => void;
}) {
  const coverSrc = useRemoteImage(row.snapshot.coverUrl ?? null);
  return (
    <li>
      <label
        className={`windows95-border flex items-center gap-2 p-1 select-none ${
          checked ? "bg-field" : "bg-primary"
        } ${importing ? "opacity-60" : "cursor-pointer"}`}
      >
        <Checkbox
          checked={checked}
          disabled={importing || (!checked && atCap)}
          onChange={() => onToggle(index)}
        />
        {coverSrc ? (
          <Image
            src={coverSrc}
            alt=""
            className="windows95-border h-10 w-8 shrink-0"
            type="cover"
          />
        ) : (
          <div className="bg-surface windows95-border h-10 w-8 shrink-0" aria-hidden />
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="windows95-text truncate text-xs font-bold">
            {row.snapshot.title}
          </span>
          <span className="text-hint windows95-font truncate text-xs">
            {row.snapshot.year ?? ""}
          </span>
        </div>
      </label>
    </li>
  );
}
