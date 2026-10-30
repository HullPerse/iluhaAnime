import { openUrl } from "@tauri-apps/plugin-opener";

import { torrentApi } from "@/api/torrent.api";
import { DETAILS_KNOWN_FIELD_LABELS } from "@/config/search/details.config";
import { attempt, reportBackgroundError } from "@/lib/core/attempt.utils";
import type { TranslationKey } from "@/lib/locale/i18n.utils";
import type { Source } from "@/types/search/search";
import type { Anime, TorrentDetailField, TorrentView } from "@/types/torrent/torrent";
import type { DetailsTab, DetailsTabEntry } from "@/types/core/panels.details";
import type { ImageLightbox } from "@/types/core/detailsModal";
import type { ModalPager } from "@/types/core/ui";

export function isExtraMetadataField(field: TorrentDetailField): boolean {
  const label = field.label.toLowerCase();
  return !DETAILS_KNOWN_FIELD_LABELS.some((known) => label.includes(known));
}

export function buildDetailTabs(
  view: TorrentView,
  t: (key: TranslationKey) => string
): DetailsTabEntry[] {
  const tabs: DetailsTabEntry[] = [{ id: "description", label: t("search.details.description") }];
  if (view.screenshots.length > 0) {
    tabs.push({
      id: "screenshots",
      label: t("search.details.screenshots"),
      count: view.screenshots.length,
    });
  }
  if (view.files.length > 0) {
    tabs.push({ id: "files", label: t("search.details.files"), count: view.files.length });
  }
  if (view.mediainfo) {
    tabs.push({ id: "mediainfo", label: t("search.details.mediainfo") });
  }
  tabs.push({
    id: "comments",
    label: t("search.details.comments"),
    count: view.comments.length,
  });
  return tabs;
}

export function resolveActiveTab(tabs: DetailsTabEntry[], tab: DetailsTab): DetailsTab {
  if (tabs.some((entry) => entry.id === tab)) return tab;
  return tabs[0]?.id ?? "description";
}

export function heroPoster(
  view: TorrentView | null,
  coverUrl: string | null,
  remoteUrl: string | null
): string | null {
  if (view?.poster) return view.poster;
  const shot = view?.screenshots[0];
  if (shot) return shot;
  return coverUrl ?? remoteUrl;
}

export function lightboxImage(lightbox: ImageLightbox): string {
  return lightbox.images[lightbox.index] ?? "";
}

export function lightboxPager(
  lightbox: ImageLightbox | null,
  label: string,
  setLightbox: (updater: (prev: ImageLightbox | null) => ImageLightbox | null) => void
): ModalPager | undefined {
  if (!lightbox || lightbox.images.length < 2) return undefined;
  const step = (delta: number) => () =>
    setLightbox((prev) =>
      prev === null
        ? prev
        : { ...prev, index: (prev.index + delta + prev.images.length) % prev.images.length }
    );
  return {
    index: lightbox.index,
    total: lightbox.images.length,
    label,
    onPrevious: step(-1),
    onNext: step(1),
  };
}

export function detailsErrorText(error: unknown): string | null {
  if (error == null) return null;
  return error instanceof Error ? error.message : String(error);
}

export async function openDetailsOriginalUrl(
  source: Source,
  item: Anime,
  view: TorrentView | null,
  detailUrl: string
): Promise<void> {
  const originalUrl = (source === "erai-raws" && item.website) || view?.url || detailUrl;
  if (source === "erai-raws" && item.website) {
    const [, pageError] = await attempt(torrentApi.eraiOpenPage(item.website));
    if (!pageError) return;
    if (!String(pageError).includes("webview_not_found")) {
      reportBackgroundError("erai.open-page", pageError);
      return;
    }
    const [, loginError] = await attempt(torrentApi.eraiWebviewLogin());
    if (loginError) {
      reportBackgroundError("erai.open-page", loginError);
      return;
    }
    const [, retryError] = await attempt(torrentApi.eraiOpenPage(item.website));
    if (retryError) reportBackgroundError("erai.open-page", retryError);
    return;
  }
  const [, openError] = await attempt(openUrl(originalUrl));
  if (openError) reportBackgroundError("details.open-original", openError);
}
