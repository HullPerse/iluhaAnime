import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { playerIcons } from "@/config/player.config";
import { cn } from "@/lib/index.utils";
import { useCategoryStore } from "@/store/category.store";
import { useState } from "react";

function CategoryIconModal({
  id,
  handleClose,
}: {
  id: string;
  handleClose: () => void;
}) {
  const category = useCategoryStore((s) =>
    s.categories.find((c) => c.id === id),
  );

  const changeIcon = useCategoryStore((s) => s.changeIcon);

  const [selected, setSelected] = useState<string>(
    category ? category.icon : "w98_directory_zipper.ico",
  );

  const handleChangeIcon = () => {
    if (!selected || !category) return;
    changeIcon(category.id, selected);
    handleClose();
  };

  return (
    <Modal
      header="Изменить икноку категории"
      onClose={handleClose}
      className="w-xl"
    >
      {/* ALL ICONS LIST + CURRENT ICON */}
      <section className="grid grid-cols-8 p-1 gap-2 windows95-border bg-white h-64 overflow-y-scroll overflow-x-hidden">
        {playerIcons.map((icon) => (
          <div
            key={icon}
            role="button"
            title={icon}
            className={cn(
              `flex items-center justify-center w-14 h-14 hover:border-2 border-secondary hover:cursor-pointer`,
              selected === icon ? "bg-secondary" : "bg-white",
            )}
            onClick={() => setSelected(icon)}
          >
            <ImageComponent
              src={`/images/${icon}`}
              alt="icon"
              className="w-14 h-14"
            />
          </div>
        ))}
      </section>

      {/* SAVE AND CANCEL */}
      <section className="mt-auto ml-auto flex flex-row gap-1 windows95-text">
        <Button onClick={handleClose}>ОТМЕНА</Button>
        <Button
          variant="success"
          onClick={handleChangeIcon}
          disabled={selected === category?.icon}
        >
          СОХРАНИТЬ
        </Button>
      </section>
    </Modal>
  );
}

export default CategoryIconModal;
