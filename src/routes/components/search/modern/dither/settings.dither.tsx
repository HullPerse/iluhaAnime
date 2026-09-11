import { useQueryClient } from "@tanstack/react-query";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { cn } from "cn";
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { SmallLoader } from "@/components/shared/loader.component";
import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import ImageComponent from "@/components/ui/image.component";
import Slider from "@/components/ui/range.component";
import { DEFAULT_WALLPAPER_FILTERS } from "@/config/settings/defaults.config";
import {
  DITHER_PER_PAGE,
  DITHER_PLACEHOLDER_ID,
  DITHER_PLACEHOLDER_SRC,
} from "@/config/utils/dither.config";
import { usePagination } from "@/hooks/pagination.hook";
import { useI18n } from "@/lib/locale/i18n.utils";
import { attempt } from "@/lib/utils/attempt.utils";
import { toUserImage } from "@/lib/utils/image.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { showError } from "@/lib/utils/notification.utils";
import { paginate } from "@/lib/utils/pagination.utils";
import { DitherUploadPlaceholder } from "@/routes/components/search/modern/dither/placeholder.dither";
import DitherPreviewModal from "@/routes/components/search/modern/dither/preview/modal.preview";
import { ShadowControls } from "@/routes/components/search/modern/dither/shadow.dither";
import { useSettingsStore } from "@/store/settings.store";
import type { DitherImageMeta, UserImage, UserImageFile } from "@/types/image.userimage";
import type { TranslationKey } from "@/types/i18n";
import type { WallpaperDisplayFilters } from "@/types/settings";

const DISPLAY_PRESETS: readonly {
  id: string;
  label: TranslationKey;
  filters: WallpaperDisplayFilters;
}[] = [
  {
    id: "normal",
    label: "search.dither.display.preset.normal",
    filters: { ...DEFAULT_WALLPAPER_FILTERS },
  },
  {
    id: "dark",
    label: "search.dither.display.preset.dark",
    filters: { brightness: 55, contrast: 100, saturate: 90, blur: 0, opacity: 100 },
  },
  {
    id: "bright",
    label: "search.dither.display.preset.bright",
    filters: { brightness: 95, contrast: 110, saturate: 120, blur: 0, opacity: 100 },
  },
  {
    id: "focus",
    label: "search.dither.display.preset.focus",
    filters: { brightness: 75, contrast: 100, saturate: 100, blur: 6, opacity: 100 },
  },
];

const DISPLAY_SLIDERS: readonly {
  key: keyof WallpaperDisplayFilters;
  label: TranslationKey;
  min: number;
  max: number;
  step: number;
}[] = [
  { key: "brightness", label: "search.dither.display.brightness", min: 0, max: 200, step: 5 },
  { key: "contrast", label: "search.dither.display.contrast", min: 0, max: 200, step: 5 },
  { key: "saturate", label: "search.dither.display.saturate", min: 0, max: 200, step: 5 },
  { key: "blur", label: "search.dither.display.blur", min: 0, max: 20, step: 1 },
  { key: "opacity", label: "search.dither.display.opacity", min: 0, max: 100, step: 5 },
];

function DitherSettings({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const patchSettings = useSettingsStore((state) => state.patch);
  const storedSelection = useSettingsStore((state) => state.selectedDitherId);
  const [page, setPage] = useState<number>(1);
  const [preview, setPreview] = useState<boolean>(false);
  const [selected, setSelected] = useState<string | null>(storedSelection ?? DITHER_PLACEHOLDER_ID);
  const queryClient = useQueryClient();
  const displayFilters = useSettingsStore((state) => state.wallpaperFilters);
  const searchShadow = useSettingsStore((state) => state.searchShadow);
  const wallpaperShadow = useSettingsStore((state) => state.wallpaperShadow);
  const parallax = useSettingsStore((state) => state.wallpaperParallax);
  const scanlines = useSettingsStore((state) => state.wallpaperScanlines);
  const [metas, setMetas] = useState<DitherImageMeta[]>([]);
  const [rows, setRows] = useState<Record<string, UserImage>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [pageLoading, setPageLoading] = useState<boolean>(false);
  const [previewImage, setPreviewImage] = useState<UserImage | null>(null);
  const [previewBusy, setPreviewBusy] = useState<boolean>(false);
  const [uploadName, setUploadName] = useState<string | null>(null);
  const uploading = uploadName !== null;
  const placeholder = useMemo<UserImage>(
    () => ({
      id: DITHER_PLACEHOLDER_ID,
      name: t("search.dither.placeholder"),
      mimeType: "image/jpeg",
      url: DITHER_PLACEHOLDER_SRC,
      originalUrl: null,
      ditherOptions: null,
      createdAt: 0,
    }),
    [t]
  );
  const isPlaceholderSelected = selected === DITHER_PLACEHOLDER_ID;

  const refresh = useCallback(async () => {
    setLoading(true);

    const [data, error] = await attempt(invokeTyped<DitherImageMeta[]>("list_dither_image_meta"));
    if (error) showError(t("common.error"), t("search.dither.load.error"));
    else setMetas(data);

    setLoading(false);
  }, [t]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const upload = async () => {
    const picked = await openDialog({
      directory: false,
      filters: [{ extensions: ["png", "jpg", "jpeg", "webp"], name: "Image" }],
      multiple: false,
      title: t("search.dither.upload.image"),
    });
    if (!picked || Array.isArray(picked)) return;
    if (picked.toLowerCase().endsWith(".gif")) {
      showError(t("common.error"), t("search.dither.upload.gif"));
      return;
    }
    setUploadName(picked.split(/[/\\]/).pop() ?? picked);
    const [image, error] = await attempt(
      invokeTyped<UserImageFile>("import_dither_image", { path: picked })
    );
    if (error) showError(t("common.error"), t("search.dither.upload.error"));
    else {
      setMetas((items) => [
        {
          id: image.id,
          name: image.name,
          mimeType: image.mimeType,
          hasOriginal: image.originalPath !== null,
          createdAt: image.createdAt,
        },
        ...items.filter((item) => item.id !== image.id),
      ]);
      const mapped = toUserImage(image);
      setRows((prev) => ({ ...prev, [mapped.id]: mapped }));
      setSelected(mapped.id);
      setPage(1);
    }
    setUploadName(null);
  };
  const remove = async () => {
    if (!selected || isPlaceholderSelected) return;
    const [, error] = await attempt(invokeTyped("delete_dither_image", { id: selected }));
    if (error) return showError(t("common.error"), error.message);
    const removedId = selected;
    setMetas((items) => items.filter((item) => item.id !== removedId));
    setRows((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => id !== removedId)));
    setSelected(DITHER_PLACEHOLDER_ID);
    if (storedSelection === selected) patchSettings({ selectedDitherId: null });
  };
  const openPreview = async () => {
    if (!selected || isPlaceholderSelected) return;
    const cached = rows[selected];
    if (cached) {
      setPreviewImage(cached);
      setPreview(true);
      return;
    }
    setPreviewBusy(true);
    const [image, error] = await attempt(
      invokeTyped<UserImageFile>("get_dither_image", { id: selected })
    );
    setPreviewBusy(false);
    if (error) {
      showError(t("common.error"), t("search.dither.load.error"));
      return;
    }
    const mapped = toUserImage(image);
    setRows((prev) => ({ ...prev, [mapped.id]: mapped }));
    setPreviewImage(mapped);
    setPreview(true);
  };
  const patchDisplayFilters = (partial: Partial<WallpaperDisplayFilters>) => {
    patchSettings({ wallpaperFilters: { ...displayFilters, ...partial } });
  };

  const save = () => {
    patchSettings({ selectedDitherId: selected });
    queryClient.invalidateQueries({ queryKey: ["dither-wallpaper"] });
    onClose();
  };

  const entryIds = useMemo(() => [DITHER_PLACEHOLDER_ID, ...metas.map((meta) => meta.id)], [metas]);
  const { lastPage } = usePagination(entryIds.length, DITHER_PER_PAGE, page, setPage);
  const pagedIds = useMemo(() => paginate(entryIds, page, DITHER_PER_PAGE), [entryIds, page]);
  const visibleImages = useMemo(
    () =>
      pagedIds
        .map((id) => (id === DITHER_PLACEHOLDER_ID ? placeholder : rows[id]))
        .filter((image): image is UserImage => image !== undefined),
    [pagedIds, placeholder, rows]
  );

  useEffect(() => {
    const missing = pagedIds.filter((id) => id !== DITHER_PLACEHOLDER_ID && rows[id] === undefined);
    if (missing.length === 0) return;
    let cancelled = false;
    setPageLoading(true);
    attempt(invokeTyped<UserImageFile[]>("get_dither_images", { ids: missing })).then(
      ([data, error]) => {
        if (cancelled) return;
        if (error) showError(t("common.error"), t("search.dither.load.error"));
        else
          setRows((prev) => {
            const next = { ...prev };
            for (const image of data.map(toUserImage)) next[image.id] = image;
            return next;
          });
        setPageLoading(false);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [pagedIds, rows, t]);
  if (preview && previewImage)
    return (
      <DitherPreviewModal
        image={previewImage}
        onBack={() => setPreview(false)}
        onSaved={(updated) => {
          setRows((prev) => ({ ...prev, [updated.id]: updated }));
          setPreviewImage(updated);
          queryClient.invalidateQueries({ queryKey: ["dither-wallpaper"] });
        }}
      />
    );

  return (
    <Modal
      header={t("search.dither.title")}
      onClose={onClose}
      headerActions={
        <button
          type="button"
          onClick={() => upload()}
          disabled={uploading}
          title={t("search.dither.add")}
          aria-label={t("search.dither.add")}
          className="windows95-active-border bg-primary text-text windows95-text flex size-5 cursor-pointer items-center justify-center hover:brightness-110 active:translate-x-px active:translate-y-px disabled:cursor-default disabled:brightness-90"
        >
          <Plus className="size-2.5" />
        </button>
      }
      className="w-xl"
    >
      <section className="border-secondary bg-win-highlight relative flex h-24 w-full flex-row border-2">
        <div className="flex flex-row items-center justify-center gap-1 p-1">
          {loading || pageLoading ? (
            <span className="windows95-text flex items-center gap-1 p-1 text-xs">
              <SmallLoader />
              {t("search.dither.loading")}
            </span>
          ) : (
            <>
              {visibleImages.map((image) => {
                return (
                  <ImageComponent
                    key={image.id}
                    src={image.url}
                    alt={image.name}
                    title={image.name}
                    onClick={() => setSelected(image.id)}
                    className={cn(
                      "aspect-video h-22",
                      selected === image.id
                        ? "hover:cursor-default"
                        : "opacity-75 hover:cursor-pointer hover:opacity-100"
                    )}
                  />
                );
              })}
              {uploading && uploadName && (
                <DitherUploadPlaceholder
                  fileName={uploadName}
                  ariaLabel={t("search.dither.uploading")}
                />
              )}
            </>
          )}
        </div>
        <div className="absolute right-1 bottom-1 z-50 flex flex-row gap-1">
          <Button
            size="icon"
            className="size-6"
            title={t("common.previous")}
            aria-label={t("common.previous")}
            onClick={() => setPage((prev) => prev - 1)}
            disabled={page === 1}
          >
            <ChevronLeft />
          </Button>

          <Button
            size="icon"
            className="size-6"
            title={t("common.next")}
            aria-label={t("common.next")}
            onClick={() => setPage((prev) => prev + 1)}
            disabled={page === lastPage}
          >
            <ChevronRight />
          </Button>
        </div>

        <div className="absolute right-1 bottom-1/2 z-50 flex translate-y-1/2 flex-row gap-1">
          <Button
            size="icon"
            className="size-6"
            title={t("common.delete")}
            aria-label={t("common.delete")}
            onClick={() => remove()}
            disabled={!selected || isPlaceholderSelected}
          >
            <Trash />
          </Button>
        </div>

        <div className="absolute top-1 right-1 z-50 flex flex-row gap-1">
          <Button
            size="icon"
            className="size-6"
            title={t("search.dither.edit")}
            aria-label={t("search.dither.edit")}
            onClick={() => openPreview()}
            disabled={!selected || isPlaceholderSelected || previewBusy}
          >
            <Pencil />
          </Button>
        </div>
      </section>
      <section className="flex w-full flex-col gap-1">
        <h3 className="windows95-text text-xs font-bold">{t("search.dither.display.title")}</h3>
        <div className="flex flex-row gap-1">
          {DISPLAY_PRESETS.map((preset) => (
            <Button
              key={preset.id}
              className="h-5 flex-1 px-1 text-xs"
              title={t(preset.label)}
              onClick={() => patchSettings({ wallpaperFilters: { ...preset.filters } })}
            >
              {t(preset.label)}
            </Button>
          ))}
        </div>
        {DISPLAY_SLIDERS.map((row) => (
          <Slider
            key={row.key}
            label={t(row.label)}
            min={row.min}
            max={row.max}
            step={row.step}
            value={displayFilters[row.key]}
            onChange={(value) => patchDisplayFilters({ [row.key]: value })}
          />
        ))}
        <div className="flex flex-row gap-2">
          <label className="flex cursor-pointer flex-row items-center gap-1">
            <Checkbox
              checked={parallax}
              onChange={(checked) => patchSettings({ wallpaperParallax: checked })}
            />
            <span className="windows95-text text-xs">{t("search.dither.display.parallax")}</span>
          </label>
          <label className="flex cursor-pointer flex-row items-center gap-1">
            <Checkbox
              checked={scanlines}
              onChange={(checked) => patchSettings({ wallpaperScanlines: checked })}
            />
            <span className="windows95-text text-xs">{t("search.dither.display.scanlines")}</span>
          </label>
        </div>
        <ShadowControls
          heading={t("search.dither.display.shadow.title")}
          value={searchShadow}
          showLength={false}
          onPatch={(partial) => patchSettings({ searchShadow: { ...searchShadow, ...partial } })}
        />
        <ShadowControls
          heading={t("search.dither.display.shadow.wallpaper")}
          value={wallpaperShadow}
          onPatch={(partial) =>
            patchSettings({ wallpaperShadow: { ...wallpaperShadow, ...partial } })
          }
        />
      </section>

      <section className="mt-auto flex w-full flex-row gap-2">
        <Button className="flex-1" variant="success" onClick={() => save()}>
          {t("search.dither.save")}
        </Button>
      </section>
    </Modal>
  );
}

export default DitherSettings;
