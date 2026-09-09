import { openUrl } from "@tauri-apps/plugin-opener";
import { useState } from "react";

import { SmallLoader } from "@/components/shared/loader.component";
import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import { anilistProxyArgs } from "@/lib/anilist/proxy.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { enterSubmit } from "@/lib/utils/keyboard.utils";
import { useSettingsStore } from "@/store/settings.store";
import type { AniUser } from "@/types/anilist";

function AniListAuthModal({
  onAuth,
  onClose,
}: {
  onAuth: (user: AniUser) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!token.trim()) return;
    setLoading(true);
    setError("");
    try {
      const user = await invokeTyped<AniUser>("anilist_login", {
        token: token.trim(),
        ...anilistProxyArgs(useSettingsStore.getState().anilistProxyUrl),
      });
      onAuth(user);
    } catch (error) {
      setError(String(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal header={t("anilist.auth.title")} onClose={onClose}>
      <div className="flex flex-col gap-2 p-1">
        <span className="windows95-text">{t("anilist.auth.intro")}</span>
        <ul className="windows95-text list-disc pl-4 text-xs">
          <li className="flex flex-row gap-1">
            {t("anilist.auth.step1")}{" "}
            <div
              role="button"
              className="font-bold hover:cursor-pointer hover:underline"
              onClick={() => openUrl("https://anilist.co/settings/developer")}
              tabIndex={-1}
            >
              anilist.co/settings/developer
            </div>
          </li>
          <li>{t("anilist.auth.step2")}</li>
          <li>
            {t("anilist.auth.step3")}{" "}
            <span className="text-text">https://anilist.co/api/v2/oauth/pin</span>
          </li>
          <li>{t("anilist.auth.step4")}</li>
          <li>
            {t("anilist.auth.step5")}{" "}
            <span className="text-text">
              https://anilist.co/api/v2/oauth/authorize?client_id=ВАШ_CLIENT_ID&response_type=token
            </span>
          </li>
          <li>{t("anilist.auth.step6")}</li>
          <li>{t("anilist.auth.step7")}</li>
        </ul>
        <label className="windows95-text text-xs font-bold" htmlFor="anilist-token">
          {t("anilist.auth.token.label")}
        </label>
        <Input
          id="anilist-token"
          placeholder={t("anilist.auth.token.placeholder")}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          onKeyDown={enterSubmit(() => {
            if (!loading) handleSubmit();
          })}
        />
        {error && (
          <span className="text-destructive windows95-text" title={error}>
            {t("anilist.auth.failed")}
          </span>
        )}
        <div className="mt-1 flex justify-end gap-1">
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={handleSubmit} disabled={loading || !token.trim()}>
            {loading ? <SmallLoader /> : t("anilist.auth.save")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default AniListAuthModal;
