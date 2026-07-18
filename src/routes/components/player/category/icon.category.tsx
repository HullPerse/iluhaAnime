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
  "w2k_sharing.ico",
  "w2k_wmp_11.ico",
  "w98_directory_admin_tools.ico",
  "w98_directory_business_calendar.ico",
  "w98_directory_channels.ico",
  "w98_directory_closed_history.ico",
  "w98_directory_folder_options.ico",
  "w98_directory_fonts.ico",
  "w98_directory_fonts_cool.ico",
  "w98_directory_fonts_shortcut.ico",
  "w98_directory_movie.ico",
  "w98_directory_network_conn.ico",
  "w98_directory_network_conn_shortcut.ico",
  "w98_directory_net_web.ico",
  "w98_directory_zipper.ico",
  "w98_help_book_cool.ico",
  "w98_internet_connection_wiz.ico",
  "w98_internet_options.ico",
  "w98_msagent.ico",
  "w98_msg_warning.ico",
  "w98_msg_warning_inv.ico",
  "w98_msn_cool.ico",
  "w98_search_directory.ico",
  "w98_SoundGrn.ico",
  "w98_SoundPu2.ico",
  "w98_SoundPur.ico",
  "w98_SoundTel.ico",
  "w98_SoundVor.ico",
  "w98_SoundYel.ico",
  "w98_template_empty.ico",
  "w98_template_nework_conn.ico",
  "w98_template_nework_places.ico",
  "w98_template_printer.ico",
  "w98_template_scanner_camera.ico",
  "w98_template_world.ico",
  "w98_tree.ico",
  "w98_trust0.ico",
  "w98_trust1_restrict.ico",
  "w98_users.ico",
  "w98_users_green.ico",
  "w98_video_.ico",
  "w98_video_gr.ico",
  "w98_video_mg.ico",
  "w98_video_mk.ico",
  "w98_video_tl.ico",
  "w98_world.ico",
  "wxp_1001.ico",
  "wxp_173.ico",
  "wxp_235.ico",
  "wxp_236.ico",
  "wxp_237.ico",
  "wxp_239.ico",
  "wxp_244.ico",
  "wxp_257.ico",
  "wxp_259.ico",
  "wxp_268.ico",
  "wxp_274.ico",
  "wxp_276.ico",
  "wxp_277.ico",
  "wxp_279.ico",
  "wxp_303.ico",
  "wxp_306.ico",
  "wxp_307.ico",
  "wxp_308.ico",
  "wxp_309.ico",
  "wxp_317.ico",
  "wxp_319.ico",
  "wxp_338.ico",
  "wxp_downloadfolder.ico",
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
