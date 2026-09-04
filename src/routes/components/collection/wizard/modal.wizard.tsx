import { invoke } from "@tauri-apps/api/core";
import { X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Tabs from "@/components/shared/tabs.component";
import { Button } from "@/components/ui/button.component";
import { WIZARD_SEARCH_DEBOUNCE_MS } from "@/config/collection.config";
import { useWizardForm } from "@/hooks/collectionWizard.hook";
import { useEscapeClose } from "@/hooks/useEscapeClose.hook";
import { useWizardSearch, type WizardSearchResult } from "@/hooks/wizardSearch.hook";
import { useCollectionData } from "@/lib/collection.queries";
import { useI18n } from "@/lib/i18n";
import { normalizeSearchText } from "@/lib/search.suggestions";
import { useSearchStore } from "@/store/search.store";
import { useSettingsStore } from "@/store/settings.store";
import type {
  CollectionItem,
  CollectionStatus,
  CollectionStatusDef,
  CustomFieldDef,
} from "@/types/collection";

import { CollectionCard } from "../card.collection";
import { WizardCoverPanelCollection } from "./cover.wizard";
import { WizardDetailsPanelCollection } from "./details.wizard";
import { WizardLocalPanelCollection } from "./local.wizard";
import { WizardSourcePanelCollection } from "./source.wizard";

const TABS = [
  { id: "source", labelKey: "collection.wizard.source" },
  { id: "details", labelKey: "collection.wizard.details" },
  { id: "cover", labelKey: "collection.wizard.cover" },
  { id: "local", labelKey: "collection.wizard.local" },
] as const;

type WizardTab = (typeof TABS)[number]["id"];

function WizardPreview({
  title,
  coverUrl,
  previewItem,
  statuses,
}: {
  title: string;
  coverUrl: string;
  previewItem: CollectionItem;
  statuses: CollectionStatusDef[];
}) {
  const { t } = useI18n();
  return (
    <div className="flex w-full shrink-0 flex-col gap-2 md:w-[200px]">
      <div className="windows95-border bg-primary sticky top-0 p-2">
        <div className="mb-1 text-xs font-bold">Preview</div>
        <div className="flex justify-center">
          <CollectionCard item={previewItem} statuses={statuses} />
        </div>
        {!title.trim() && (
          <p className="text-destructive mt-1 text-xs">{t("collection.wizard.title")} *</p>
        )}
        {!coverUrl && (
          <p className="text-destructive text-xs">{t("collection.wizard.coverRequired")}</p>
        )}
      </div>
    </div>
  );
}

export function WizardModalCollection({
  open,
  onClose,
  onSave,
  onDelete,
  initial,
  statuses,
  customFieldDefs,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (item: Omit<CollectionItem, "id" | "addedAt" | "updatedAt">) => void;
  onDelete?: (id: string) => void;
  initial?: CollectionItem | null;
  statuses: CollectionStatusDef[];
  customFieldDefs: CustomFieldDef[];
}) {
  const [tab, setTab] = useState<WizardTab>(initial ? "details" : "source");
  const [source, setSource] = useState<"anilist" | "tmdb" | "custom">("custom");
  const [search, setSearch] = useState("");
  // Local uploads are only read at save time; refs avoid pointless re-renders.
  const coverBlobIdRef = useRef<string | null>(initial?.coverBlobId ?? null);
  const uploadedCoversRef = useRef<{ id: string; dataUrl: string }[]>([]);
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
    setExternalIds,
    localPath,
    setLocalPath,
    setLocalKind,
    customFields,
    setCustomFields,
    buildItem,
    previewItem,
  } = form;
  const tmdbApiKey = useSettingsStore((s) => s.tmdbApiKey);
  const tmdbProxyUrl = useSettingsStore((s) => s.tmdbProxyUrl);
  const { t } = useI18n();
  const { items: collectionItems } = useCollectionData();
  const animeIndex = useSearchStore((s) => s.animeIndex);
  // Demote only titles already present in the chosen status. The same title in
  // another status is a deliberate second entry and stays a normal pick.
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
  const favIds = useMemo(
    () => new Set(animeIndex.filter((a) => a.favourite).map((a) => a.id)),
    [animeIndex]
  );
  const { searchResults, coverOptions, setCoverOptions, loading, searchError, runSearch } =
    useWizardSearch(source, search, tmdbApiKey, tmdbProxyUrl, existingTitles, favIds);
  const editing = Boolean(initial);

  const selectCover = useCallback(
    (url: string) => {
      setCoverUrl(url);
      const match = uploadedCoversRef.current.find((c) => c.dataUrl === url);
      coverBlobIdRef.current = match?.id ?? null;
    },
    [setCoverUrl]
  );

  const handleUploadLocalCover = useCallback(
    (id: string, dataUrl: string) => {
      uploadedCoversRef.current = [
        { id, dataUrl },
        ...uploadedCoversRef.current.filter((c) => c.id !== id),
      ];
      coverBlobIdRef.current = id;
      setCoverUrl(dataUrl);
      setCoverOptions((prev) => (prev.includes(dataUrl) ? prev : [dataUrl, ...prev]));
    },
    [setCoverOptions, setCoverUrl]
  );

  function applyCoverFromResult(cover: string | null): void {
    if (!cover) return;
    coverBlobIdRef.current = null;
    setCoverUrl(cover);
    setCoverOptions((prev) => (prev.includes(cover) ? prev : [cover, ...prev]));
  }

  function applyExternalId(resultId: number): void {
    const key = source === "anilist" ? "anilist" : source === "tmdb" ? "tmdb" : null;
    if (!key) return;
    setExternalIds((prev) => ({ ...prev, [key]: resultId }));
  }

  const handlePickResult = (r: WizardSearchResult) => {
    setTitle(r.title);
    if (r.altTitles?.length) {
      setAltTitles(r.altTitles.join(", "));
    }
    if (r.year) setYear(String(r.year));
    applyCoverFromResult(r.cover_url);
    if (r.duration) setDurationMinutes(String(r.duration));
    if (r.episodes) setProgressTotal(String(r.episodes));
    if (r.genres?.length) setGenres(r.genres.join(", "));
    if (r.studio) setStudio(r.studio);
    applyExternalId(r.id);
  };

  async function resolveCoverBlobId(
    currentBlobId: string | null,
    url: string
  ): Promise<string | null> {
    if (currentBlobId) return currentBlobId;
    if (!url.startsWith("http://") && !url.startsWith("https://")) return null;
    try {
      const cached = await invoke<{ id: string }>("download_remote_image", {
        url,
        nameHint: "collection-cover",
      });
      return cached.id;
    } catch {
      return null;
    }
  }

  const handleSave = async () => {
    if (!title.trim() || !coverUrl) return;
    const blobId = await resolveCoverBlobId(coverBlobIdRef.current, coverUrl);
    onSave(buildItem(blobId));
    onClose();
  };

  useEffect(() => {
    if (editing) return;
    if (source === "custom") return;
    if (!search.trim() || search.trim().length < 2) return;
    const id = window.setTimeout(() => {
      runSearch().catch(() => undefined);
    }, WIZARD_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [search, source, editing, runSearch]);

  useEscapeClose(onClose, open);

  if (!open) return null;
  const visibleTabs = editing ? TABS.filter((tab) => tab.id !== "source") : TABS;
  const activeTab: WizardTab = editing && tab === "source" ? "details" : tab;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2">
      <div className="windows95-active-border bg-primary flex max-h-[92vh] w-full max-w-4xl flex-col">
        <div className="ui-titlebar justify-between">
          <span className="font-bold text-white">
            {editing ? t("collection.editMedia") : t("collection.addMedia")}
          </span>
          <Button size="icon" className="size-5" onClick={onClose}>
            <X className="size-3" />
          </Button>
        </div>
        <Tabs
          tabs={visibleTabs.map((tab) => ({ id: tab.id, label: t(tab.labelKey) }))}
          activeTab={activeTab}
          onChange={setTab}
        />
        <div className="flex min-h-0 flex-1 flex-col gap-2 p-2 md:flex-row">
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
            {activeTab === "source" && !editing && (
              <section className="windows95-border bg-primary p-2">
                <WizardSourcePanelCollection
                  source={source}
                  setSource={setSource}
                  search={search}
                  setSearch={setSearch}
                  onSearch={runSearch}
                  loading={loading}
                  hasTmdbKey={!!tmdbApiKey}
                  searchError={searchError}
                  searchResults={searchResults}
                  onPickResult={handlePickResult}
                />
              </section>
            )}
            {activeTab === "details" && (
              <section className="windows95-border bg-primary p-2">
                <WizardDetailsPanelCollection
                  title={title}
                  setTitle={setTitle}
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
                <WizardCoverPanelCollection
                  coverOptions={coverOptions}
                  coverUrl={coverUrl}
                  setCoverUrl={selectCover}
                  setCoverOptions={setCoverOptions}
                  title={title}
                  onUploadLocal={handleUploadLocalCover}
                />
              </section>
            )}
            {activeTab === "local" && (
              <section className="windows95-border bg-primary p-2">
                <WizardLocalPanelCollection
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
        <div className="windows95-border-t bg-primary flex items-center gap-2 p-2">
          <span className="text-hint hidden text-xs md:inline">
            {editing
              ? t("collection.editMedia")
              : `${searchResults.length ? `${searchResults.length} results` : ""}`}
          </span>
          {editing && initial && onDelete && (
            <Button
              variant="destructive"
              onClick={() => {
                onDelete(initial.id);
                onClose();
              }}
            >
              {t("common.delete")}
            </Button>
          )}
          <div className="ml-auto flex gap-1">
            <Button onClick={onClose}>{t("common.cancel")}</Button>
            <Button
              variant="outline"
              disabled={!title.trim() || !coverUrl}
              onClick={() => handleSave().catch(() => undefined)}
            >
              {t("collection.wizard.save")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
