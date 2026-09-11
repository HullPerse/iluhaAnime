import { X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Tabs from "@/components/shared/tabs.component";
import { Button } from "@/components/ui/button.component";
import {
  WIZARD_SEARCH_DEBOUNCE_MS,
  WIZARD_TABS,
} from "@/config/collection/defaults.config";
import { useDiscardGuard, useDirtySinceMount } from "@/hooks/collection/discard.hook";
import { useWizardPick } from "@/hooks/collection/pick.hook";
import { useCollectionData } from "@/hooks/collection/queries.hook";
import { useWizardSave } from "@/hooks/collection/save.hook";
import { useWizardSearch } from "@/hooks/collection/search.hook";
import { useWizardForm } from "@/hooks/collection/wizard.hook";
import { useEscapeClose } from "@/hooks/escapeClose.hook";
import { useI18n } from "@/lib/locale/i18n.utils";
import { normalizeSearchText } from "@/lib/search/suggestions.utils";
import { useSearchStore } from "@/store/search.store";
import { useSettingsStore } from "@/store/settings.store";
import type {
  CollectionItem,
  CollectionStatus,
  CollectionStatusDef,
  CustomFieldDef,
  WizardPrefill,
  WizardTab,
} from "@/types/collection";

import { WizardCoverPanel } from "./cover.wizard";
import { WizardDetailsPanel } from "./details.wizard";
import { WizardFooter } from "./footer.wizard";
import { WizardLocalPanel } from "./local.wizard";
import { WizardPreview } from "./preview.wizard";
import { WizardSourcePanel } from "./source.wizard";

export function WizardModal({
  open,
  onClose,
  onSave,
  onDelete,
  initial,
  prefill,
  statuses,
  customFieldDefs,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (item: Omit<CollectionItem, "id" | "addedAt" | "updatedAt">) => void;
  onDelete?: (id: string) => void;
  initial?: CollectionItem | null;
  prefill?: WizardPrefill | null;
  statuses: CollectionStatusDef[];
  customFieldDefs: CustomFieldDef[];
}) {
  const [tab, setTab] = useState<WizardTab>(initial ? "details" : "source");
  const [source, setSource] = useState<"anilist" | "tmdb" | "custom">("custom");
  const [search, setSearch] = useState("");

  const coverBlobIdRef = useRef<string | null>(initial?.coverBlobId ?? null);
  const uploadedCoversRef = useRef<{ id: string; url: string }[]>([]);
  const form = useWizardForm(initial);
  const {
    title,
    setTitle,
    altTitles,
    setAltTitles,
    type,
    setType,
    status,
    setStatus,
    progressValue,
    setProgressValue,
    progressTotal,
    setProgressTotal,
    progressUnit,
    setProgressUnit,
    rating,
    setRating,
    isFavorite,
    setIsFavorite,
    year,
    setYear,
    description,
    setDescription,
    durationMinutes,
    setDurationMinutes,
    genres,
    setGenres,
    studio,
    setStudio,
    startedAt,
    setStartedAt,
    finishedAt,
    setFinishedAt,
    coverUrl,
    setCoverUrl,
    externalIds,
    localPath,
    setLocalPath,
    setLocalKind,
    customFields,
    setCustomFields,
    previewItem,
  } = form;
  const prefillApplied = useRef(false);
  useEffect(() => {
    if (initial || !prefill || prefillApplied.current) return;
    prefillApplied.current = true;
    setTitle(prefill.title);
    setCoverUrl(prefill.coverUrl ?? "");
    setStatus(prefill.status);
  }, [initial, prefill, setTitle, setCoverUrl, setStatus]);
  const [coverBroken, setCoverBroken] = useState(false);
  const tmdbKeySet = useSettingsStore((s) => s.tmdbKeySet);
  const tmdbProxyUrl = useSettingsStore((s) => s.tmdbProxyUrl);
  const { t } = useI18n();
  const { items: collectionItems } = useCollectionData();
  const animeIndex = useSearchStore((s) => s.animeIndex);
  const existingTitles = useMemo(() => {
    const set = new Set<string>();
    for (const it of collectionItems) {
      if (it.status !== status) continue;
      set.add(normalizeSearchText(it.title));
      for (const alt of it.altTitles) {
        if (alt) set.add(normalizeSearchText(alt));
      }
    }
    return set;
  }, [collectionItems, status]);
  const duplicateTitle = useMemo(() => {
    const current = normalizeSearchText(title.trim());
    if (!current) return false;
    return collectionItems.some(
      (it) =>
        it.id !== initial?.id &&
        (normalizeSearchText(it.title) === current ||
          it.altTitles.some((alt) => normalizeSearchText(alt) === current))
    );
  }, [collectionItems, title, initial]);
  const favIds = useMemo(
    () => new Set(animeIndex.filter((a) => a.favourite).map((a) => a.id)),
    [animeIndex]
  );
  const { searchResults, coverOptions, setCoverOptions, loading, searchError, runSearch } =
    useWizardSearch(source, search, tmdbKeySet, tmdbProxyUrl, existingTitles, favIds);
  const editing = Boolean(initial);

  const selectCover = useCallback(
    (url: string) => {
      setCoverBroken(false);
      setCoverUrl(url);
      const match = uploadedCoversRef.current.find((c) => c.url === url);
      coverBlobIdRef.current = match?.id ?? null;
    },
    [setCoverUrl]
  );

  const handleUploadLocalCover = useCallback(
    (id: string, url: string) => {
      uploadedCoversRef.current = [
        { id, url },
        ...uploadedCoversRef.current.filter((c) => c.id !== id),
      ];
      coverBlobIdRef.current = id;
      setCoverBroken(false);
      setCoverUrl(url);
      setCoverOptions((prev) => (prev.includes(url) ? prev : [url, ...prev]));
    },
    [setCoverOptions, setCoverUrl]
  );

  const { handlePickResult, mediaRef } = useWizardPick({
    form,
    source,
    tmdbKeySet,
    tmdbProxyUrl,
    coverBlobIdRef,
    setCoverBroken,
    setCoverOptions,
  });
  const { handleSave } = useWizardSave({ form, coverBlobIdRef, mediaRef, onSave, onClose });

  useEffect(() => {
    if (editing) return;
    if (source === "custom") return;
    if (!search.trim() || search.trim().length < 2) return;
    const id = window.setTimeout(() => {
      runSearch().catch(() => undefined);
    }, WIZARD_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [search, source, editing, runSearch]);

  const draftSignature = JSON.stringify([
    title,
    altTitles,
    type,
    status,
    progressValue,
    progressTotal,
    progressUnit,
    rating,
    isFavorite,
    year,
    description,
    durationMinutes,
    genres,
    studio,
    startedAt,
    finishedAt,
    coverUrl,
    localPath,
  ]);
  const dirty = useDirtySinceMount(draftSignature);
  const { confirmDiscard, requestClose, cancelDiscard } = useDiscardGuard(dirty, onClose);
  useEscapeClose(requestClose, open);
  if (!open) return null;
  const visibleTabs = editing ? WIZARD_TABS.filter((tab) => tab.id !== "source") : WIZARD_TABS;
  const activeTab: WizardTab = editing && tab === "source" ? "details" : tab;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2">
      <div className="windows95-active-border bg-primary flex max-h-[92vh] w-full max-w-4xl flex-col">
        <div className="ui-titlebar justify-between">
          <span className="font-bold text-white">
            {editing ? t("collection.edit.media") : t("collection.addMedia")}
          </span>
          <Button size="icon" className="size-5" onClick={requestClose}>
            <X className="size-3" />
          </Button>
        </div>
        <Tabs
          ariaLabel={editing ? t("collection.edit.media") : t("collection.addMedia")}
          tabs={visibleTabs.map((tab) => ({ id: tab.id, label: t(tab.labelKey) }))}
          activeTab={activeTab}
          onChange={setTab}
        />
        <div className="flex min-h-0 flex-1 flex-col gap-2 p-2 md:flex-row">
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
            {activeTab === "source" && !editing && (
              <section className="windows95-border bg-primary p-2">
                <WizardSourcePanel
                  source={source}
                  setSource={setSource}
                  search={search}
                  setSearch={setSearch}
                  onSearch={runSearch}
                  loading={loading}
                  hasTmdbKey={tmdbKeySet}
                  searchError={searchError}
                  searchResults={searchResults}
                  onPickResult={handlePickResult}
                />
              </section>
            )}
            {activeTab === "details" && (
              <section className="windows95-border bg-primary p-2">
                <WizardDetailsPanel
                  title={title}
                  setTitle={setTitle}
                  duplicateTitle={duplicateTitle}
                  type={type}
                  setType={setType}
                  status={status}
                  setStatus={(v: CollectionStatus) => setStatus(v)}
                  statuses={statuses}
                  progressValue={progressValue}
                  setProgressValue={setProgressValue}
                  progressTotal={progressTotal}
                  setProgressTotal={setProgressTotal}
                  progressUnit={progressUnit}
                  setProgressUnit={setProgressUnit}
                  rating={rating}
                  setRating={setRating}
                  isFavorite={isFavorite}
                  setIsFavorite={setIsFavorite}
                  altTitles={altTitles}
                  setAltTitles={setAltTitles}
                  year={year}
                  setYear={setYear}
                  durationMinutes={durationMinutes}
                  setDurationMinutes={setDurationMinutes}
                  studio={studio}
                  setStudio={setStudio}
                  genres={genres}
                  setGenres={setGenres}
                  startedAt={startedAt}
                  setStartedAt={setStartedAt}
                  finishedAt={finishedAt}
                  setFinishedAt={setFinishedAt}
                  externalIds={externalIds}
                  description={description}
                  setDescription={setDescription}
                  customFieldDefs={customFieldDefs}
                  customFields={customFields}
                  onCustomFieldsChange={setCustomFields}
                />
              </section>
            )}
            {activeTab === "cover" && (
              <section className="windows95-border bg-primary p-2">
                <WizardCoverPanel
                  coverOptions={coverOptions}
                  coverUrl={coverUrl}
                  setCoverUrl={selectCover}
                  setCoverOptions={setCoverOptions}
                  title={title}
                  onUploadLocal={handleUploadLocalCover}
                  onPreviewFailedChange={setCoverBroken}
                />
              </section>
            )}
            {activeTab === "local" && (
              <section className="windows95-border bg-primary p-2">
                <WizardLocalPanel
                  localPath={localPath}
                  setLocalPath={setLocalPath}
                  setLocalKind={setLocalKind}
                />
              </section>
            )}
          </div>
          <WizardPreview
            title={title}
            coverUrl={coverUrl}
            previewItem={previewItem}
            statuses={statuses}
          />
        </div>
        <WizardFooter
          editing={editing}
          initial={initial}
          onDelete={onDelete}
          onClose={onClose}
          requestClose={requestClose}
          canSave={Boolean(title.trim() && coverUrl && !coverBroken)}
          onSave={() => handleSave().catch(() => undefined)}
          confirmDiscard={confirmDiscard}
          cancelDiscard={cancelDiscard}
          resultsLabel={`${searchResults.length ? `${searchResults.length} results` : ""}`}
        />
      </div>
    </div>
  );
}
