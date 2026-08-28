import { invoke } from "@tauri-apps/api/core";
import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button.component";
import { useWizardForm } from "@/hooks/collectionWizard.hook";
import { useWizardSearch } from "@/hooks/wizardSearch.hook";
import { useI18n } from "@/lib/i18n";
import { useSettingsStore } from "@/store/settings.store";
import type { CollectionItem, CustomFieldDef } from "@/types/collection";
import { CollectionCard } from "../card.collection";
import { WizardCoverPanel } from "./cover.wizard";
import { WizardDetailsPanel } from "./details.wizard";
import { WizardLocalPanel } from "./local.wizard";
import { WizardSourcePanel } from "./source.wizard";

export function WizardModal({
  open,
  onClose,
  onSave,
  onDelete,
  initial,
  customFieldDefs,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (
    item: Omit<CollectionItem, "id" | "addedAt" | "updatedAt">
  ) => void;
  onDelete?: (id: string) => void;
  initial?: CollectionItem | null;
  customFieldDefs: CustomFieldDef[];
}) {
  const [source, setSource] = useState<"anilist" | "tmdb" | "custom">("custom");
  const [search, setSearch] = useState("");
  // Local uploads are only read at save time; refs avoid pointless re-renders.
  const coverBlobIdRef = useRef<string | null>(
    initial?.coverBlobId ?? null
  );
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
    priority,
    setPriority,
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
  const { t } = useI18n();
  const { searchResults, coverOptions, setCoverOptions, loading, runSearch } = useWizardSearch(source, search, tmdbApiKey);
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
      setCoverOptions((prev) =>
        prev.includes(dataUrl) ? prev : [dataUrl, ...prev]
      );
    },
    [setCoverOptions, setCoverUrl]
  );

  const handlePickResult = (r: {
    id: number;
    title: string;
    cover_url: string | null;
    year?: number;
    duration?: number | null;
    episodes?: number | null;
    genres?: string[];
    studio?: string | null;
  }) => {
    setTitle(r.title);
    if (r.year) setYear(String(r.year));
    if (r.cover_url) {
      coverBlobIdRef.current = null;
      setCoverUrl(r.cover_url);
      setCoverOptions((prev) =>
        prev.includes(r.cover_url as string)
          ? prev
          : [r.cover_url as string, ...prev]
      );
    }
    if (r.duration) setDurationMinutes(String(r.duration));
    if (r.episodes) setProgressTotal(String(r.episodes));
    if (r.genres && r.genres.length) setGenres(r.genres.join(", "));
    if (r.studio) setStudio(r.studio);
    if (source === "anilist")
      setExternalIds((prev) => ({ ...prev, anilist: r.id }));
    if (source === "tmdb") setExternalIds((prev) => ({ ...prev, tmdb: r.id }));
  };

  const handleSave = async () => {
    if (!title.trim() || !coverUrl) return;
    let blobId: string | null = coverBlobIdRef.current;
    if (
      !blobId &&
      (coverUrl.startsWith("http://") || coverUrl.startsWith("https://"))
    ) {
      try {
        const cached = await invoke<{ id: string }>("download_remote_image", {
          url: coverUrl,
          nameHint: "collection-cover",
        });
        blobId = cached.id;
      } catch {
        // Keep the URL as a recoverable fallback when offline at save time.
      }
    }
    onSave(buildItem(blobId));
    onClose();
  };

  useEffect(() => {
    if (editing) return;
    if (source === "custom") return;
    if (!search.trim() || search.trim().length < 2) return;
    const id = window.setTimeout(() => {
      runSearch().catch(() => undefined);
    }, 350);
    return () => window.clearTimeout(id);
  }, [search, source, editing, runSearch]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2">
      <div className="windows95-active-border bg-primary flex max-h-[92vh] w-full max-w-4xl flex-col">
        <div className="ui-titlebar justify-between">
          <span className="font-bold text-white">{editing ? t("collection.editMedia") : t("collection.addMedia")}</span>
          <Button size="icon" className="size-5" onClick={onClose}>
            <X className="size-3" />
          </Button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-2 p-2 md:flex-row">
          {/* Left: form */}
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
            {!editing && (
              <section className="windows95-border bg-white p-2">
                <div className="mb-1 flex items-center gap-1">
                  <span className="text-xs font-bold">{t("collection.wizard.source") ?? "Source"}</span>
                  <span className="text-hint text-xs">- {t("collection.wizard.manualHint")}</span>
                </div>
                <WizardSourcePanel
                  source={source}
                  setSource={setSource}
                  search={search}
                  setSearch={setSearch}
                  onSearch={runSearch}
                  loading={loading}
                  hasTmdbKey={!!tmdbApiKey}
                  searchResults={searchResults}
                  onPickResult={handlePickResult}
                />
              </section>
            )}
            <section className="windows95-border bg-white p-2">
              <h3 className="mb-1 text-xs font-bold">{t("collection.wizard.details") ?? "Details"} *</h3>
              <WizardDetailsPanel
                title={title}
                setTitle={setTitle}
                altTitles={altTitles}
                setAltTitles={setAltTitles}
                type={type}
                setType={setType}
                status={status}
                setStatus={setStatus}
                progressValue={progressValue}
                setProgressValue={setProgressValue}
                progressTotal={progressTotal}
                setProgressTotal={setProgressTotal}
                progressUnit={progressUnit}
                setProgressUnit={setProgressUnit}
                rating={rating}
                setRating={setRating}
                priority={priority}
                setPriority={setPriority}
                isFavorite={isFavorite}
                setIsFavorite={setIsFavorite}
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
            <section className="windows95-border bg-white p-2">
              <WizardCoverPanel
                coverOptions={coverOptions}
                coverUrl={coverUrl}
                setCoverUrl={selectCover}
                setCoverOptions={setCoverOptions}
                title={title}
                onUploadLocal={handleUploadLocalCover}
              />
            </section>
            <section className="windows95-border bg-white p-2">
              <WizardLocalPanel localPath={localPath} setLocalPath={setLocalPath} setLocalKind={setLocalKind} />
            </section>
          </div>
          {/* Right: preview */}
          <div className="flex w-full shrink-0 flex-col gap-2 md:w-[200px]">
            <div className="windows95-border bg-white p-2">
              <div className="mb-1 text-xs font-bold">Preview</div>
              <div className="flex justify-center">
                <CollectionCard
                  item={previewItem}
                  onEdit={() => {}}
                  onDelete={() => {}}
                  onOpen={() => {}}
                  onProgress={() => {}}
                  onSetStatus={() => {}}
                />
              </div>
              {!title.trim() && <p className="text-destructive mt-1 text-xs">{t("collection.wizard.title")} *</p>}
              {!coverUrl && <p className="text-destructive text-xs">{t("collection.wizard.coverRequired")}</p>}
            </div>
          </div>
        </div>
        <div className="windows95-border-t bg-primary flex items-center gap-2 p-2">
          <span className="text-hint hidden text-xs md:inline">
            {editing ? t("collection.editMedia") : `${searchResults.length ? `${searchResults.length} results` : ""}`}
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
            <Button variant="outline" disabled={!title.trim() || !coverUrl} onClick={() => handleSave().catch(() => undefined)}>
              {t("collection.wizard.save")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}