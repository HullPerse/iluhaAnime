import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { useI18n } from "@/hooks/i18n.hook";
import { useFolderContentChanged } from "@/hooks/watcher/changes.watcher.hook";
import { attempt, reportBackgroundError } from "@hullperse/hp_utils/attempt";
import { patchableVideoChanges, touchesExtensions } from "@/lib/core/watchers/changesWatcher.utils";
import { isExtraFile } from "@/lib/core/shared/extra.utils";
import { queryKeys } from "@/lib/core/hotkeys/keys.utils";
import { showErrorOnce } from "@/lib/core/ui/notification.utils";
import { normalizePath } from "@/lib/core/watchers/pathsWatcher.utils";
import { folderScanBus } from "@/lib/core/watchers/scanBus.utils";
import { buildTree, patchTreeFile, removeTreeFile } from "@/lib/player/playerTree.utils";
import { setFolderTrees as setCachedFolderTrees } from "@/store/cache.store";
import { settingsAtoms } from "@/store/settings.store";
import type { FolderChange } from "@/types/core/watcher";
import type { VideoFileEntry } from "@/types/core/fs";
import type { PlayerFolderSyncOptions } from "@/types/player/folderSync";
import type { FolderNode } from "@/types/torrent/torrent";

export function usePlayerFolderSync(options: PlayerFolderSyncOptions): void {
  const { folderTrees, setFolderTrees, savedFolderPaths, videoExtensions, scanThreads } = options;
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const folderScanDisposedRef = useRef<boolean>(false);

  useEffect(() => {
    folderScanDisposedRef.current = false;
    return () => {
      folderScanDisposedRef.current = true;
    };
  }, []);

  useFolderContentChanged(
    (payload) => {
      if (payload.changes.some((change) => isExtraFile(change.path)))
        queryClient.invalidateQueries({ queryKey: queryKeys.extraFilesScope() });
      if (!touchesExtensions(payload.changes, videoExtensions)) return;
      const libraryRoots = new Set(savedFolderPaths.map(normalizePath));
      const byRoot = new Map<string, FolderChange[]>();
      for (const change of payload.changes) {
        if (!libraryRoots.has(normalizePath(change.root))) continue;
        const bucket = byRoot.get(change.root);
        if (bucket) bucket.push(change);
        else byRoot.set(change.root, [change]);
      }
      if (byRoot.size === 0) return;
      const applyFullScan = (path: string, entries: VideoFileEntry[]) => {
        setFolderTrees((prev) => {
          const next = prev.filter((tree) => tree.path !== path);
          if (entries.length) next.push(buildTree(entries, path));
          setCachedFolderTrees(next.map((tree) => ({ path: tree.path, tree })));
          return next;
        });
      };
      const rescanPath = async (path: string) => {
        const [entries, scanError] = await attempt(
          folderScanBus().fullScan({
            root: path,
            extensions: videoExtensions,
            threads: scanThreads,
          })
        );
        if (scanError || folderScanDisposedRef.current) {
          if (scanError) {
            reportBackgroundError("folders.rescan", scanError);
            if (settingsAtoms.notifyScanErrors.get())
              showErrorOnce("folders-scan", t("notification.scan.failed"), scanError.message);
          }
          return;
        }
        applyFullScan(path, entries ?? []);
      };
      const patchRoot = async (root: string, changes: FolderChange[]) => {
        const key = normalizePath(root);
        const upserts = changes.filter((change) => change.kind !== "removed").map((c) => c.path);
        const removals = changes.filter((change) => change.kind === "removed").map((c) => c.path);
        const target = folderTrees.find((tree) => normalizePath(tree.path) === key);
        if (!target) {
          await rescanPath(root);
          return;
        }
        const [outcome, patchError] = await attempt(
          folderScanBus().patchScan({
            root,
            upserts,
            removals,
            extensions: videoExtensions,
            threads: scanThreads,
          })
        );
        if (folderScanDisposedRef.current) return;
        if (patchError || !outcome) {
          if (patchError) {
            reportBackgroundError("folders.patch", patchError);
            if (settingsAtoms.notifyScanErrors.get())
              showErrorOnce("folders-scan", t("notification.scan.failed"), patchError.message);
          }
          await rescanPath(root);
          return;
        }
        if (outcome.kind === "full") {
          applyFullScan(root, outcome.entries);
          return;
        }
        let patched: FolderNode = target;
        for (const path of outcome.removed) {
          const next = removeTreeFile(patched, path);
          if (!next) {
            await rescanPath(root);
            return;
          }
          patched = next;
        }
        for (const entry of outcome.fresh) {
          const next = patchTreeFile(patched, entry);
          if (!next) {
            await rescanPath(root);
            return;
          }
          patched = next;
        }
        if (patched.files.length === 0 && patched.children.length === 0) {
          setFolderTrees((prev) => {
            const next = prev.filter((tree) => normalizePath(tree.path) !== key);
            setCachedFolderTrees(next.map((tree) => ({ path: tree.path, tree })));
            return next;
          });
          return;
        }
        setFolderTrees((prev) => {
          const next = prev.map((tree) => (normalizePath(tree.path) === key ? patched : tree));
          setCachedFolderTrees(next.map((tree) => ({ path: tree.path, tree })));
          return next;
        });
      };
      (async () => {
        await Promise.all(
          [...byRoot.entries()].map(([root, changes]) =>
            patchableVideoChanges(changes, videoExtensions)
              ? patchRoot(root, changes)
              : rescanPath(root)
          )
        );
      })();
    },
    { errorTag: "folderscan" }
  );
}
