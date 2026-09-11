import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { ImagePlus } from "lucide-react";
import { useState } from "react";

import { InputDialog } from "@/components/shared/prompt.component";
import { Button } from "@/components/ui/button.component";
import { WIZARD_COVER_MAX } from "@/config/collection/defaults.config";
import { useRemoteImage } from "@/hooks/remoteImage.hook";
import { generatePlaceholder } from "@/lib/collection/placeholder.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import { assetUrl } from "@/lib/utils/image.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { showError } from "@/lib/utils/notification.utils";
import type { UserImageFile } from "@/types/image.userimage";

import { MemoCoverThumb } from "./coverThumb.wizard";

export function WizardCoverPanel({
  coverOptions,
  coverUrl,
  setCoverUrl,
  setCoverOptions,
  title,
  onUploadLocal,
  onPreviewFailedChange,
}: {
  coverOptions: string[];
  coverUrl: string;
  setCoverUrl: (url: string) => void;
  setCoverOptions: React.Dispatch<React.SetStateAction<string[]>>;
  title: string;
  onUploadLocal?: (id: string, url: string) => void;
  onPreviewFailedChange?: (failed: boolean) => void;
}) {
  const { t } = useI18n();
  const [pastingUrl, setPastingUrl] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewState, setPreviewState] = useState({ url: "", failed: false });
  const previewFailed = previewState.url === coverUrl && previewState.failed;
  const previewSrc = useRemoteImage(coverUrl || null);

  const uploadLocal = async () => {
    if (!onUploadLocal) return;
    const selectedPath = await openDialog({
      multiple: false,
      directory: false,
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp"] }],
    });
    if (!selectedPath || Array.isArray(selectedPath)) return;
    if (!/\.(png|jpe?g|gif|webp)$/iu.test(selectedPath)) {
      showError(t("common.error"), t("collection.wizard.upload.error"));
      return;
    }
    setUploading(true);
    try {
      const image = await invokeTyped<UserImageFile>("import_user_image", { path: selectedPath });
      onUploadLocal(image.id, assetUrl(image.path));
    } catch {
      showError(t("common.error"), t("collection.wizard.upload.error"));
    } finally {
      setUploading(false);
    }
  };

  const usePlaceholder = () => {
    const data = generatePlaceholder(title || t("collection.wizard.placeholder.cover"));
    onPreviewFailedChange?.(false);
    setCoverUrl(data);
    setCoverOptions((prev) => [data, ...prev]);
  };

  return (
    <div className="mb-2 flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-xs font-bold">
          {t("collection.wizard.pick.cover")} <span className="text-destructive">*</span>
        </span>
        {coverUrl ? (
          <div className="h-16 w-12 shrink-0">
            {!previewFailed && previewSrc ? (
              <img
                src={previewSrc}
                alt="selected"
                className="windows95-border h-full w-full object-cover"
                onError={() => {
                  setPreviewState({ url: coverUrl, failed: true });
                  onPreviewFailedChange?.(true);
                }}
              />
            ) : (
              <div className="windows95-border flex h-full w-full items-center justify-center bg-white">
                <span className="text-hint text-xs">-</span>
              </div>
            )}
          </div>
        ) : null}
        {previewFailed && (
          <span className="text-destructive text-xs">
            {t("collection.wizard.cover.invalid.url")}
          </span>
        )}
        <div className="ml-auto flex gap-1">
          <Button className="h-6 px-2 text-xs" onClick={uploadLocal} disabled={uploading}>
            <ImagePlus className="size-3" /> {t("collection.wizard.upload.image")}
          </Button>
          <Button className="h-6 px-2 text-xs" onClick={() => setPastingUrl(true)}>
            {t("collection.wizard.paste.url")}
          </Button>
          <Button className="h-6 px-2 text-xs" onClick={usePlaceholder}>
            {t("collection.wizard.placeholder.cover")}
          </Button>
        </div>
      </div>
      {coverOptions.length > 0 && (
        <div className="grid grid-cols-4 gap-1 overflow-x-auto">
          {coverOptions.slice(0, WIZARD_COVER_MAX).map((url) => (
            <MemoCoverThumb key={url} url={url} selected={coverUrl === url} onPick={setCoverUrl} />
          ))}
        </div>
      )}
      {!coverUrl && (
        <p className="text-destructive text-xs">{t("collection.wizard.cover.required")}</p>
      )}
      {pastingUrl && (
        <InputDialog
          header={t("collection.wizard.paste.url")}
          label={t("collection.wizard.paste.url")}
          placeholder="https://"
          onSubmit={(url) => {
            const value = url.trim();
            if (
              !value ||
              (!value.startsWith("http://") &&
                !value.startsWith("https://") &&
                !value.startsWith("data:"))
            ) {
              showError(t("common.error"), t("collection.wizard.cover.invalid.url"));
              return;
            }
            setPastingUrl(false);
            onPreviewFailedChange?.(false);
            setCoverUrl(value);
            setCoverOptions((prev) => [value, ...prev]);
          }}
          onClose={() => setPastingUrl(false)}
        />
      )}
    </div>
  );
}
