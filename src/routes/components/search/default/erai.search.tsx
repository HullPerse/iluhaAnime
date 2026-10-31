import { useState } from "react";

import { torrentApi } from "@/api/torrent.api";
import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { mapError } from "@/lib/core/erai.utils";
import { attempt } from "@/lib/core/attempt.utils";

export default function EraiLoginModal({
  setEraiAuth,
  setShowLogin,
}: {
  setEraiAuth: (value: boolean) => void;
  setShowLogin: (value: boolean) => void;
}) {
  const { t } = useI18n();
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  const close = () => setShowLogin(false);

  const openBrowser = async () => {
    setLoading(true);
    setError("");
    const [, error] = await attempt(torrentApi.eraiWebviewLogin());
    if (error) setError(mapError(String(error), t));
    setLoading(false);
  };

  const saveSession = async () => {
    setLoading(true);
    setError("");
    const [, error] = await attempt(torrentApi.eraiFinishWebviewLogin());
    if (error) setError(mapError(String(error), t));
    else {
      setEraiAuth(true);
      close();
    }
    setLoading(false);
  };

  return (
    <Modal header={t("search.erai.title")} onClose={close} className="w-xl">
      <div className="flex flex-col gap-2 p-1">
        <Button onClick={openBrowser} loading={loading}>
          {t("search.erai.open.browser")}
        </Button>
        {error && <span className="text-destructive windows95-text">{error}</span>}
        <div className="mt-1 flex justify-end gap-1">
          <Button onClick={close}>{t("common.cancel")}</Button>
          <Button onClick={saveSession} loading={loading}>
            {t("search.erai.save.session")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
