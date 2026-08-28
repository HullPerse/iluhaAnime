import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { FolderOpen } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/i18n";

export function WizardLocalPanel({
  localPath,
  setLocalPath,
  setLocalKind,
}: {
  localPath: string;
  setLocalPath: (value: string) => void;
  setLocalKind: (kind: "file" | "folder" | null) => void;
}) {
  const { t } = useI18n();
  const pickFile = async () => {
    const sel = await openDialog({ multiple: false, directory: false });
    if (typeof sel === "string") {
      setLocalPath(sel);
      setLocalKind("file");
    }
  };
  const pickFolder = async () => {
    const sel = await openDialog({ multiple: false, directory: true });
    if (typeof sel === "string") {
      setLocalPath(sel);
      setLocalKind("folder");
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <span className="text-hint shrink-0 text-xs">
          {t("collection.wizard.localHint")}
        </span>
        <input
          value={localPath}
          readOnly
          placeholder={t("collection.wizard.noFileLinked")}
          className="windows95-border min-w-0 flex-1 bg-white px-1 py-0.5 text-xs"
        />
        <Button className="h-6 px-2 text-xs" onClick={pickFile}>
          <FolderOpen className="size-3" /> {t("collection.wizard.file")}
        </Button>
        <Button className="h-6 px-2 text-xs" onClick={pickFolder}>
          <FolderOpen className="size-3" /> {t("collection.wizard.folder")}
        </Button>
        {localPath && (
          <Button
            variant="destructive"
            className="h-6 px-2 text-xs"
            onClick={() => {
              setLocalPath("");
              setLocalKind(null);
            }}
          >
            {t("collection.wizard.clear")}
          </Button>
        )}
      </div>
    </div>
  );
}