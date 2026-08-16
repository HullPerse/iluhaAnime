import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { ImagePlus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import UserImageIcon from "@/components/shared/avatar.component";
import { SmallLoader } from "@/components/shared/loader.component";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/index.utils";
import { showError } from "@/lib/notification.utils";
import { userImageIcon } from "@/lib/userimage.utils";
import type { UserImage } from "@/types";

interface UserImagePickerProps {
  selected?: string;
  onSelect: (icon: string, image?: UserImage) => void;
}

export default function UserImagePicker({
  selected,
  onSelect,
}: UserImagePickerProps) {
  const { t } = useI18n();
  const [images, setImages] = useState<UserImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setImages(await invoke<UserImage[]>("list_user_images"));
    } catch {
      setImages([]);
      showError(t("common.error"), t("player.category.loadImagesError"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const upload = async () => {
    const selectedPath = await open({
      directory: false,
      filters: [
        { name: "Image", extensions: ["png", "jpg", "jpeg", "gif", "webp"] },
      ],
      multiple: false,
      title: t("player.category.uploadImage"),
    });
    if (!selectedPath || Array.isArray(selectedPath)) return;
    setUploading(true);
    try {
      const image = await invoke<UserImage>("import_user_image", {
        path: selectedPath,
      });
      setImages((items) => [
        image,
        ...items.filter((item) => item.id !== image.id),
      ]);
      onSelect(userImageIcon(image.id), image);
    } catch {
      showError(t("common.error"), t("player.category.uploadError"));
    } finally {
      setUploading(false);
    }
  };

  const remove = async (image: UserImage) => {
    await invoke("delete_user_image", { id: image.id }).catch(() => {});
    setImages((items) => items.filter((item) => item.id !== image.id));
  };

  return (
    <section className="windows95-border bg-primary mt-2 p-1">
      <div className="mb-1 flex items-center justify-between">
        <span className="windows95-text text-[10px]">
          {t("player.category.uploadedImages")}
        </span>
        <Button
          className="h-5 px-1 text-[9px]"
          onClick={() => upload()}
          disabled={uploading}
        >
          {uploading ? <SmallLoader /> : <ImagePlus className="mr-1 size-3" />}
          {t("player.category.upload")}
        </Button>
      </div>
      {loading ? (
        <div className="flex justify-center py-2">
          <SmallLoader />
        </div>
      ) : images.length === 0 ? (
        <span className="windows95-text text-muted text-[9px]">
          {t("player.category.noUploadedImages")}
        </span>
      ) : (
        <div className="grid max-h-28 grid-cols-6 gap-1 overflow-y-auto">
          {images.map((image) => {
            const icon = userImageIcon(image.id);
            return (
              <div
                key={image.id}
                className="group relative flex flex-col items-center gap-px"
              >
                <button
                  type="button"
                  title={image.name}
                  onClick={() => onSelect(icon, image)}
                  className={cn(
                    "windows95-border hover:bg-surface flex size-10 items-center justify-center bg-white p-0.5",
                    selected === icon && "bg-secondary"
                  )}
                >
                  <UserImageIcon
                    icon={icon}
                    dataUrl={image.dataUrl}
                    className="size-full"
                  />
                </button>
                <button
                  type="button"
                  title={t("player.category.deleteImage")}
                  onClick={() => remove(image)}
                  className="bg-destructive absolute -top-1 -right-1 hidden size-3 items-center justify-center text-white group-hover:flex"
                >
                  <Trash2 className="size-2" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
