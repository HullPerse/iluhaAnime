import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { useCallback, useState } from "react";

import { useI18n, type TranslationKey } from "@/lib/i18n";
import { useNotificationStore } from "@/store/notification.store";

/**
 * Export/import actions for the collection data menu plus the import
 * strategy dialog state. The dialog itself is rendered by the route from
 * the returned state; confirmImport runs the chosen strategy.
 */
export function useCollectionDataActions() {
  const { t } = useI18n();
  const [importStrategyOpen, setImportStrategyOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);

  const notify = useCallback(
    (type: "success" | "error", key: TranslationKey) => {
      useNotificationStore.getState().add(t("app.collection"), type, t(key));
    },
    [t]
  );

  const handleExportJson = useCallback(async () => {
    try {
      const data = await invoke<unknown>("export_collection_data");
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `iluhaAnime-collection-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      notify("success", "collection.export.done");
    } catch {
      notify("error", "collection.export.error");
    }
  }, [notify]);

  const handleExportZip = useCallback(async () => {
    try {
      const path = await save({
        defaultPath: `iluhaAnime-collection-${new Date().toISOString().slice(0, 10)}.zip`,
        filters: [{ name: "ZIP", extensions: ["zip"] }],
      });
      if (!path) return;
      await invoke("export_collection_zip", { outPath: path });
      notify("success", "collection.export.zipDone");
    } catch {
      notify("error", "collection.export.error");
    }
  }, [notify]);

  const runImport = useCallback(
    async (strategy: string, file: File) => {
      try {
        const text = await file.text();
        const data = JSON.parse(text) as unknown;
        const summary = await invoke<{
          imported: number;
          skipped: number;
          overwritten: number;
          created: number;
        }>("import_collection_data", { data, strategy });
        useNotificationStore.getState().add(
          t("app.collection"),
          "success",
          t("collection.import.done", {
            imported: String(summary.imported),
            skipped: String(summary.skipped),
            created: String(summary.created),
          })
        );
      } catch (err) {
        useNotificationStore
          .getState()
          .add(t("app.collection"), "error", String(err));
      }
    },
    [t]
  );

  const handleImportFile = useCallback((file: File) => {
    setImportFile(file);
    setImportStrategyOpen(true);
  }, []);

  const handleConfirmImport = useCallback(
    (strategy: string) => {
      const file = importFile;
      setImportStrategyOpen(false);
      setImportFile(null);
      if (!file) return;
      runImport(strategy, file).catch(() => {});
    },
    [importFile, runImport]
  );

  const handleCloseImport = useCallback(() => {
    setImportStrategyOpen(false);
    setImportFile(null);
  }, []);

  return {
    handleExportJson,
    handleExportZip,
    handleImportFile,
    handleConfirmImport,
    handleCloseImport,
    importStrategyOpen,
    importFile,
  };
}