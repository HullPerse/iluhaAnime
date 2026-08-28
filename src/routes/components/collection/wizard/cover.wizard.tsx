import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { ImagePlus } from "lucide-react";
import { useState } from "react";

import { InputDialog } from "@/components/shared/prompt.component";
import { Button } from "@/components/ui/button.component";
import { generatePlaceholder } from "@/lib/collection.utils";
import { useI18n } from "@/lib/i18n";
import { showError } from "@/lib/notification.utils";
import type { UserImage } from "@/types";

export function WizardCoverPanel({
  coverOptions,
  coverUrl,
  setCoverUrl,
  setCoverOptions,
  title,
  onUploadLocal,
}: {
  coverOptions: string[];
  coverUrl: string;
  setCoverUrl: (url: string) => void;
  setCoverOptions: React.Dispatch<React.SetStateAction<string[]>>;
  title: string;
  onUploadLocal?: (id: string, dataUrl: string) => void;
}) {
  const { t } = useI18n();
  const [pastingUrl, setPastingUrl] = useState(false);
  const [uploading, setUploading] = useState(false);
  const pasteUrl = () => setPastingUrl(true);
  const uploadLocal = async () => {
    if (!onUploadLocal) return;
    const selectedPath = await openDialog({
      directory: false,
      multiple: false,
      filters: [
        { name: "Image", extensions: ["png", "jpg", "jpeg", "gif", "webp"] },
      ],
    });
    if (!selectedPath || Array.isArray(selectedPath)) return;
    setUploading(true);
    try {
      const image = await invoke<UserImage>("import_user_image", {
        path: selectedPath,
      });
      onUploadLocal(image.id, image.dataUrl);
    } catch {
      showError(t("common.error"), t("collection.wizard.uploadError"));
    } finally {
      setUploading(false);
    }
  };
  const usePlaceholder = () => {
    const data = generatePlaceholder(
      title || t("collection.wizard.placeholderCover")
    );
    setCoverUrl(data);
    setCoverOptions((prev) => [data, ...prev]);
  };

  return (
    <div className="mb-2 flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-xs font-bold">
          {t("collection.wizard.pickCover")} <span className="text-destructive">*</span>
        </span>
        {coverOptions.length > 0 && (
          <div className="flex gap-1 overflow-x-auto">
            {coverOptions.map((url) => (
              <button
                key={url}
                type="button"
                onClick={() => setCoverUrl(url)}
                className={`windows95-border h-14 w-10 shrink-0 overflow-hidden ${coverUrl === url ? "outline-secondary outline-2" : ""}`}
              >
                <img src={url} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
        {coverUrl && (
          <img
            src={coverUrl}
            alt="selected"
            className="windows95-border h-16 w-12 object-cover"
          />
        )}
        <div className="ml-auto flex gap-1">
          <Button
            className="h-6 px-2 text-xs"
            onClick={uploadLocal}
            disabled={uploading}
          >
            <ImagePlus className="size-3" /> {t("collection.wizard.uploadImage")}
          </Button>
          <Button className="h-6 px-2 text-xs" onClick={pasteUrl}>
            {t("collection.wizard.pasteUrl")}
          </Button>
          <Button className="h-6 px-2 text-xs" onClick={usePlaceholder}>
            {t("collection.wizard.placeholderCover")}
          </Button>
        </div>
      </div>
      {!coverUrl && (
        <p className="text-destructive text-xs">
          {t("collection.wizard.coverRequired")}
        </p>
      )}
      {pastingUrl && (
        <InputDialog
          header={t("collection.wizard.pasteUrl")}
          label={t("collection.wizard.pasteUrl")}
          placeholder="https://"
          onSubmit={(url) => {
            setPastingUrl(false);
            setCoverUrl(url);
            setCoverOptions((prev) => [url, ...prev]);
          }}
          onClose={() => setPastingUrl(false)}
        />
      )}
    </div>
  );
}