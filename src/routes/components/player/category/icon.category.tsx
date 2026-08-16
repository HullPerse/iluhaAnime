import { useState } from "react";

import UserImageIcon from "@/components/shared/avatar.component";
import Modal from "@/components/shared/modal.component";
import UserImagePicker from "@/components/shared/avatar.picker";
import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { playerIcons } from "@/config/player.config";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/index.utils";
import { enterOrSpace } from "@/lib/keyboard.utils";
import { useCategoryStore } from "@/store/category.store";
import type { UserImage } from "@/types";

function CategoryIconModal({
  id,
  handleClose,
}: {
  id: string;
  handleClose: () => void;
}) {
  const category = useCategoryStore((s) =>
    s.categories.find((c) => c.id === id)
  );

  const changeIcon = useCategoryStore((s) => s.changeIcon);

  const { t } = useI18n();
  const [selected, setSelected] = useState<string>(
    category ? category.icon : "w98_directory_zipper.ico"
  );

  const handleChangeIcon = () => {
    if (!selected || !category) return;
    changeIcon(category.id, selected);
    handleClose();
  };

  const handleUserImage = (icon: string, _image?: UserImage) => {
    setSelected(icon);
  };

  return (
    <Modal
      header={t("player.category.changeIcon")}
      onClose={handleClose}
      className="w-xl"
    >
      {/* ALL ICONS LIST + CURRENT ICON */}
      <section className="windows95-border grid h-64 grid-cols-8 gap-2 overflow-x-hidden overflow-y-scroll bg-white p-1">
        {playerIcons.map((icon) => (
          <div
            key={icon}
            role="button"
            tabIndex={0}
            aria-label={icon}
            title={icon}
            className={cn(
              `border-secondary flex h-14 w-14 items-center justify-center hover:cursor-pointer hover:border-2`,
              selected === icon ? "bg-secondary" : "bg-white"
            )}
            onClick={() => setSelected(icon)}
            onKeyDown={enterOrSpace(() => setSelected(icon))}
          >
            <ImageComponent
              src={`/images/${icon}`}
              alt="icon"
              className="h-14 w-14"
            />
          </div>
        ))}
      </section>

      <UserImagePicker selected={selected} onSelect={handleUserImage} />

      {selected.startsWith("user-image:") && (
        <div className="windows95-text mt-1 flex items-center gap-1 text-[10px]">
          <span>{t("player.category.selected")}</span>
          <UserImageIcon
            icon={selected}
            className="windows95-border size-6 bg-white"
          />
        </div>
      )}

      {/* SAVE AND CANCEL */}
      <section className="windows95-text mt-2 ml-auto flex flex-row gap-1">
        <Button onClick={handleClose}>
          {t("common.cancel").toUpperCase()}
        </Button>
        <Button
          variant="success"
          onClick={handleChangeIcon}
          disabled={selected === category?.icon}
        >
          {t("player.category.save").toUpperCase()}
        </Button>
      </section>
    </Modal>
  );
}

export default CategoryIconModal;
