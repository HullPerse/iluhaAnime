import { useState } from "react";
import { Button } from "../ui/button.component";
import { SmallLoader } from "./loader.component";
import Modal from "./modal.component";
import { installUpdate } from "@/lib/index.utils";
import { Update } from "@tauri-apps/plugin-updater";
import ImageComponent from "../ui/image.component";

function Updater({ update, onClose }: { update: Update; onClose: () => void }) {
  const [loading, setLoading] = useState<boolean>(false);

  return (
    <Modal
      header="Обновление"
      onClose={onClose}
      className="w-lg h-70 flex items-center gap-2"
    >
      <span className="text-center windows95-font text-xl font-bold underline text-text">
        {`Доступно обновление ${update.currentVersion} -> ${update.version}`}
      </span>
      <section className="flex windows95-border w-28 h-28 self-center items-center justify-center">
        <ImageComponent
          src="/icons/update_icon.ico"
          alt="update icon"
          className="w-24 h-24"
        />
      </section>

      <section className="windows95-font text-md text-text font-semibold leading-relaxed whitespace-pre-line text-center">
        <span className="">Обновить приложение до новой версии?</span>
        <div className="flex flex-row gap-1 w-full">
          <Button
            variant="destructive"
            className="h-9 flex-1"
            onClick={onClose}
            disabled={loading}
          >
            ОТМЕНИТЬ
          </Button>
          <Button
            variant="success"
            className="h-9 flex-1"
            onClick={async () => {
              setLoading(true);

              await installUpdate(update)
                .catch((e) => {
                  console.error(`Error while installing update`, e);
                  setLoading(false);
                })
                .finally(() => setLoading(false));
            }}
            disabled={loading}
          >
            {loading ? <SmallLoader /> : "ОБНОВИТЬ"}
          </Button>
        </div>
      </section>
    </Modal>
  );
}

export default Updater;
