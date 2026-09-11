import { useState } from "react";

import { SmallLoader } from "@/components/shared/loader.component";
import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import { mapError } from "@/lib/search/erai.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";

export default function EraiLoginModal({
  setEraiAuth,
  setShowLogin,
}: {
  setEraiAuth: (value: boolean) => void;
  setShowLogin: (value: boolean) => void;
}) {
  const { t } = useI18n();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const close = () => setShowLogin(false);

  const openBrowser = async () => {
    setLoading(true);
    setError("");
    try {
      await invokeTyped("erai_webview_login");
    } catch (reason) {
      setError(mapError(String(reason), t));
    } finally {
      setLoading(false);
    }
  };

  const saveSession = async () => {
    setLoading(true);
    setError("");
    try {
      await invokeTyped("erai_finish_webview_login");
      setEraiAuth(true);
      close();
    } catch (reason) {
      setError(mapError(String(reason), t));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal header={t("search.erai.title")} onClose={close} className="w-xl">
      <div className="flex flex-col gap-2 p-1">
        <Button onClick={openBrowser} disabled={loading}>
          {loading ? <SmallLoader /> : t("search.erai.open.browser")}
        </Button>
        {error && <span className="text-destructive windows95-text">{error}</span>}
        <div className="mt-1 flex justify-end gap-1">
          <Button onClick={close}>{t("common.cancel")}</Button>
          <Button onClick={saveSession} disabled={loading}>
            {loading ? <SmallLoader /> : t("search.erai.save.session")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
