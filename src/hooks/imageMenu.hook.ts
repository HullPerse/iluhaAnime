import { writeImage, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { save } from "@tauri-apps/plugin-dialog";
import { Copy, Link, Save } from "lucide-react";
import { useMemo } from "react";
import { attempt } from "@hullperse/hp_utils/attempt";

import { systemApi } from "@/api/system.api";
import { useI18n } from "@/hooks/i18n.hook";
import { fetchRemoteImagePath } from "@/hooks/remoteImage.hook";
import { ignore } from "@/lib/core/shared/promise.utils";
import { showError } from "@/lib/core/ui/notification.utils";
import { canCopyPosterUrl, posterPngBlob } from "@/lib/torrent/poster.utils";
import type { ContextMenuEntry } from "@/types/ui/contextMenu";

/**
 * Context menu entries for any image: save as PNG, copy the bitmap, copy the URL.
 * Remote images outside the asset protocol are fetched through the Rust cache first,
 * because a webview `fetch` of a third-party image is blocked by CORS and the CSP.
 */
export function useImageMenuEntries(src: string | null, viaCache = false): ContextMenuEntry[] {
  const { t } = useI18n();

  return useMemo(() => {
    if (src === null) return [];
    const source = src;

    const copyUrl = (): void => {
      ignore(
        attempt(writeText(source)).then(([, error]) => {
          if (error) showError(t("common.error"), t("screenshot.copy.error"));
          return null;
        })
      );
    };

    const copyCachedImage = (): void => {
      ignore(
        attempt(fetchRemoteImagePath(source)).then(([path, fetchError]) => {
          if (fetchError || path === null) {
            showError(t("common.error"), t("screenshot.copy.error"));
            return null;
          }
          ignore(
            attempt(writeImage(path)).then(([, writeError]) => {
              if (writeError) showError(t("common.error"), t("screenshot.copy.error"));
              return null;
            })
          );
          return null;
        })
      );
    };

    const saveCachedImage = (): void => {
      ignore(
        attempt(fetchRemoteImagePath(source)).then(([path, fetchError]) => {
          if (fetchError || path === null) {
            showError(t("common.error"), t("screenshot.save.error"));
            return null;
          }
          const cachedPath = path;
          ignore(
            (async () => {
              const [picked, dialogError] = await attempt(
                save({
                  defaultPath: `${fileNameOf(source)}.png`,
                  filters: [{ name: "PNG images", extensions: ["png"] }],
                })
              );
              if (dialogError || !picked) {
                if (dialogError) showError(t("common.error"), t("screenshot.save.error"));
                return;
              }
              const [bytes, readError] = await attempt(systemApi.readFileBytes(cachedPath));
              if (readError || !bytes) {
                showError(t("common.error"), t("screenshot.save.error"));
                return;
              }
              const [, saveError] = await attempt(systemApi.savePosterBytes(bytes, picked));
              if (saveError) showError(t("common.error"), t("screenshot.save.error"));
            })()
          );
          return null;
        })
      );
    };

    const copyImage = viaCache ? copyCachedImage : (): void => {
      ignore(
        attempt(posterPngBlob(source)).then(([blob, fetchError]) => {
          if (fetchError || !blob) {
            showError(t("common.error"), t("screenshot.copy.error"));
            return;
          }
          ignore(
            attempt(navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])).then(
              ([, writeError]) => {
                if (writeError) showError(t("common.error"), t("screenshot.copy.error"));
                return null;
              }
            )
          );
          return null;
        })
      );
    };

    const saveImage = viaCache ? saveCachedImage : (): void => {
      ignore(
        attempt(posterPngBlob(source)).then(([blob, fetchError]) => {
          if (fetchError || !blob) {
            showError(t("common.error"), t("screenshot.save.error"));
            return;
          }
          const bytes = blob;
          ignore(
            (async () => {
              const base = source.split("?")[0]?.split("/").pop()?.trim() || "image";
              const [picked, dialogError] = await attempt(
                save({
                  defaultPath: `${base}.png`,
                  filters: [{ name: "PNG images", extensions: ["png"] }],
                })
              );
              if (dialogError || !picked) {
                if (dialogError) showError(t("common.error"), t("screenshot.save.error"));
                return;
              }
              const [, saveError] = await attempt(
                systemApi.savePosterBytes([...new Uint8Array(await bytes.arrayBuffer())], picked)
              );
              if (saveError) showError(t("common.error"), t("screenshot.save.error"));
            })()
          );
          return null;
        })
      );
    };

    const entries: ContextMenuEntry[] = [
      {
        kind: "item",
        id: "save",
        label: "search.details.image.save",
        icon: Save,
        onSelect: saveImage,
      },
      {
        kind: "item",
        id: "copy",
        label: "search.details.image.copy",
        icon: Copy,
        onSelect: copyImage,
      },
    ];
    if (canCopyPosterUrl(source)) {
      entries.push({
        kind: "item",
        id: "copy-url",
        label: "search.details.image.copy.url",
        icon: Link,
        onSelect: copyUrl,
      });
    }
    return entries;
  }, [src, t, viaCache]);
}

function fileNameOf(url: string): string {
  return url.split("?")[0]?.split("/").pop()?.trim() || "image";
}
