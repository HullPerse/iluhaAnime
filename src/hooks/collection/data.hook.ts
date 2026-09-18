import { save } from "@tauri-apps/plugin-dialog";
import { useCallback, useState } from "react";

import { useI18n, type TranslationKey } from "@/lib/locale/i18n.utils";
import { attempt, attemptSync } from "@/lib/utils/attempt.utils";
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
    const [data, dataError] = await attempt(invokeTyped<unknown>("export_collection_data"));
    if (dataError) {
      notify("error", "collection.export.error");
      return;
    }
    const [json, jsonError] = attemptSync(() => JSON.stringify(data, null, 2));
    if (jsonError) {
      notify("error", "collection.export.error");
      return;
    }
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `iluhaAnime-collection-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify("success", "collection.export.done");
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
      const [text, textError] = await attempt(file.text());
      if (textError) {
        useNotificationStore
          .getState()
          .add(t("app.collection"), "error", textError.message);
        return;
      }
      const [data, parseError] = attemptSync(() => JSON.parse(text) as unknown);
      if (parseError) {
        useNotificationStore
          .getState()
          .add(t("app.collection"), "error", parseError.message);
        return;
      }
      const [summary, importError] = await attempt(
        invokeTyped<{
          imported: number;
          skipped: number;
          overwritten: number;
          created: number;
        }>("import_collection_data", { data, strategy })
      );
      if (importError) {
        useNotificationStore
          .getState()
          .add(t("app.collection"), "error", importError.message);
        return;
      }
      useNotificationStore.getState().add(
        t("app.collection"),
        "success",
        t("collection.import.done", {
          imported: String(summary.imported),
          skipped: String(summary.skipped),
          created: String(summary.created),
        })
      );
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
