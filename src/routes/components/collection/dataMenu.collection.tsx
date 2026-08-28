import { Archive, ChevronDown, Download, Upload } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/i18n";

export function DataMenu({
  onExportJson,
  onExportZip,
  onImportFile,
}: {
  onExportJson: () => void;
  onExportZip: () => void;
  onImportFile: (file: File) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="relative">
      <Button onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <Download className="size-3" /> {t("collection.data")}{" "}
        <ChevronDown className="size-3" />
      </Button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="windows95-active-border bg-primary absolute top-full left-0 z-40 flex w-44 flex-col p-0.5">
            <button
              type="button"
              className="hover:bg-surface flex items-center gap-1 px-2 py-1 text-left text-xs"
              onClick={() => {
                setOpen(false);
                onExportJson();
              }}
            >
              <Download className="size-3" /> {t("collection.export.title")}
            </button>
            <button
              type="button"
              className="hover:bg-surface flex items-center gap-1 px-2 py-1 text-left text-xs"
              onClick={() => {
                setOpen(false);
                onExportZip();
              }}
            >
              <Archive className="size-3" /> {t("collection.export.zip")}
            </button>
            <button
              type="button"
              className="hover:bg-surface flex items-center gap-1 px-2 py-1 text-left text-xs"
              onClick={() => {
                setOpen(false);
                inputRef.current?.click();
              }}
            >
              <Upload className="size-3" /> {t("collection.import.title")}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) onImportFile(file);
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}

