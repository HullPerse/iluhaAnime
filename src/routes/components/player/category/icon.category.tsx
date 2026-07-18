import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { cn } from "@/lib/index.utils";
import { useCategoryStore } from "@/store/category.store";
import { useState } from "react";

const icons = [
  "w2k_bitmap_image.ico",
  "w2k_computer.ico",
  "w2k_dustbin.ico",
  "w2k_floppy.ico",
  "w2k_folder_closed.ico",
  "w2k_globe.ico",
  "w2k_wmp_11.ico",
  "w98_directory_zipper.ico",
];

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
        {icons.map((icon) => (
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
              src={`/icons/${icon}`}
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
