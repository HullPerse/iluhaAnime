import type { Update } from "@tauri-apps/plugin-updater";
import { useState } from "react";

import { useI18n } from "@/lib/locale/i18n.utils";
import { attempt } from "@/lib/utils/attempt.utils";
import { installUpdate } from "@/lib/utils/update.utils";

import { Button } from "../ui/button.component";
import ImageComponent from "../ui/image.component";
import { SmallLoader } from "./loader.component";
import Modal from "./modal.component";

function Updater({ update, onClose }: { update: Update; onClose: () => void }) {
  const [loading, setLoading] = useState<boolean>(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const { t } = useI18n();

  return (
    <Modal
      header={t("updater.title")}
      onClose={onClose}
      className="flex h-70 w-lg items-center gap-2"
    >
      <span className="windows95-font text-text text-center text-xl font-bold underline">
        {t("updater.available", {
          current: update.currentVersion,
          version: update.version,
        })}
      </span>
      <section className="windows95-border flex h-28 w-28 items-center justify-center self-center">
        <ImageComponent src="/images/update_icon.ico" alt="update icon" className="h-24 w-24" />
      </section>

      <section className="windows95-font text-md text-text text-center leading-relaxed font-semibold whitespace-pre-line">
        <span className="">{t("updater.prompt")}</span>
        {installError && (
          <span className="text-destructive block text-sm font-normal">
            {t("updater.install.error", { message: installError })}
          </span>
        )}
        <div className="flex w-full flex-row gap-1">
          <Button variant="destructive" className="h-9 flex-1" onClick={onClose} disabled={loading}>
            {t("updater.cancel")}
          </Button>
          <Button
            variant="success"
            className="h-9 flex-1"
            onClick={async () => {
              setLoading(true);
              setInstallError(null);
              const [, error] = await attempt(installUpdate(update));
              if (error) {
                setInstallError(error instanceof Error ? error.message : String(error));
              }
              setLoading(false);
            }}
            disabled={loading}
          >
            {loading ? <SmallLoader /> : t("updater.install")}
          </Button>
        </div>
      </section>
    </Modal>
  );
}

export default Updater;
