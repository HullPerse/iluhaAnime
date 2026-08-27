import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";

import { SmallLoader } from "@/components/shared/loader.component";
import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n";

type EraiErrorCode =
  | "webview_open"
  | "webview_save"
  | "webview_not_found"
  | "no_session"
  | "network";

const ERROR_KEYS: Record<EraiErrorCode, TranslationKey> = {
  webview_open: "search.erai.errWebviewOpen",
  webview_save: "search.erai.errWebviewSave",
  webview_not_found: "search.erai.errWebviewNotFound",
  no_session: "search.erai.errNoSession",
  network: "search.erai.errNetwork",
};

function mapError(raw: string, t: (key: TranslationKey) => string): string {
  const code = raw.split(":")[0].trim() as EraiErrorCode;
  return t(ERROR_KEYS[code] ?? "search.erai.errUnknown");
}

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
      await invoke("erai_webview_login");
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
      await invoke("erai_finish_webview_login");
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
        <span className="windows95-text text-muted text-xs leading-snug">
          {t("search.erai.hint")}
        </span>
        <Button onClick={openBrowser} disabled={loading}>
          {loading ? <SmallLoader /> : t("search.erai.openBrowser")}
        </Button>
        {error && (
          <span className="text-destructive windows95-text">{error}</span>
        )}
        <div className="mt-1 flex justify-end gap-1">
          <Button onClick={close}>{t("common.cancel")}</Button>
          <Button onClick={saveSession} disabled={loading}>
            {loading ? <SmallLoader /> : t("search.erai.saveSession")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
