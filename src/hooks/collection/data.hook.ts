import { save } from "@tauri-apps/plugin-dialog";
import { useCallback, useState } from "react";

import { useI18n, type TranslationKey } from "@/lib/locale/i18n.utils";
import { attempt } from "@/lib/utils/attempt.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { useNotificationStore } from "@/store/notification.store";

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
      const data = await invokeTyped<unknown>("export_collection_data");
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
    const path = await save({
      defaultPath: `iluhaAnime-collection-${new Date().toISOString().slice(0, 10)}.zip`,
      filters: [{ name: "ZIP", extensions: ["zip"] }],
    });
    if (!path) return;
    const [, error] = await attempt(invokeTyped("export_collection_zip", { outPath: path }));
    if (error) notify("error", "collection.export.error");
    else notify("success", "collection.export.zip.done");
  }, [notify]);

  const runImport = useCallback(
    async (strategy: string, file: File) => {
      try {
        const text = await file.text();
        const data = JSON.parse(text) as unknown;
        const summary = await invokeTyped<{
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
          .add(t("app.collection"), "error", err instanceof Error ? err.message : String(err));
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
      runImport(strategy, file);
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
