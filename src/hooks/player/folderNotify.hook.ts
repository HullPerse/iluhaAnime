import { useCallback, useEffect, useRef } from "react";

import { useI18n } from "@/hooks/i18n.hook";
import { useLiveResource } from "@/hooks/liveResource.hook";
import { diffFolderSnapshot, type FolderSnapshot } from "@/lib/player/folder.utils";
import { readAppCache, writeAppCache } from "@/lib/store/cache.utils";
import { attempt, reportBackgroundError } from "@/lib/utils/attempt.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { addNotification } from "@/store/notification.store";
import { settingsAtoms } from "@/store/settings.store";
import type { FolderScanResult } from "@/types/fs";

const FOLDER_CHECK_INTERVAL_MS = 30 * 60 * 1000;
const SNAPSHOT_NAMESPACE = "player";
const SNAPSHOT_KEY = "folderSnapshot";

export function useWatchedFolderNotifications(
  paths: string[],
  extensions: string[]
): { reportScan: (path: string, files: string[], notify: boolean) => void } {
  const { t } = useI18n();
  const snapshotRef = useRef<FolderSnapshot | null>(null);
  const snapshotLoadedRef = useRef(false);

  const reportScan = useCallback(
    (path: string, files: string[], notify: boolean) => {
      const run = async () => {
        if (!snapshotLoadedRef.current) {
          const [cached] = await attempt(
            readAppCache<FolderSnapshot>(SNAPSHOT_NAMESPACE, SNAPSHOT_KEY)
          );
          snapshotRef.current = cached?.payload ?? {};
          snapshotLoadedRef.current = true;
        }
        const { fresh, next } = diffFolderSnapshot(snapshotRef.current, path, files);
        snapshotRef.current = next;
        const [, writeError] = await attempt(writeAppCache(SNAPSHOT_NAMESPACE, SNAPSHOT_KEY, next));
        if (writeError) reportBackgroundError("folders.snapshot.save", writeError);
        if (notify && fresh.length > 0 && settingsAtoms.notifyNewFiles.get()) {
          addNotification(
            t("notification.newfiles"),
            "info",
            t("notification.newfiles.body", { count: fresh.length }),
            `newfiles:${path}:${fresh.length}:${fresh[0] ?? ""}`,
            { system: false, target: { source: "folder", path } }
          );
        }
      };
      run().catch((error: unknown) => reportBackgroundError("folders.snapshot.diff", error));
    },
    [t]
  );

  const reportRef = useRef(reportScan);
  useEffect(() => {
    reportRef.current = reportScan;
  }, [reportScan]);

  useLiveResource({
    intervalMs: FOLDER_CHECK_INTERVAL_MS,
    enabled: paths.length > 0,
    collectKeys: () => ["watched-folders"],
    shouldFetch: () => paths.length > 0 && settingsAtoms.notifyNewFiles.get(),
    fetch: async () => {
      const [results, error] = await attempt(
        invokeTyped<FolderScanResult[]>("scan_video_folders", { paths, extensions })
      );
      if (error) {
        reportBackgroundError("folders.newfiles.scan", error);
        return true;
      }
      for (const result of results ?? []) {
        reportRef.current(
          result.path,
          result.entries.map((entry) => entry.path),
          true
        );
      }
      return true;
    },
  });

  return { reportScan };
}
