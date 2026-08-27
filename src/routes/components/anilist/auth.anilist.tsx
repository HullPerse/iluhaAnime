import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";

import { SmallLoader } from "@/components/shared/loader.component";
import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import { useI18n } from "@/lib/i18n";
import { enterSubmit } from "@/lib/keyboard.utils";
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
      const user = await invoke<AniUser>("anilist_login", {
        token: token.trim(),
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
          <li>
            {t("anilist.auth.step1")}{" "}
            <a
              className="underline"
              href="https://anilist.co/settings/developer"
              target="_blank"
              rel="noreferrer"
            >
              anilist.co/settings/developer
            </a>
          </li>
          <li>{t("anilist.auth.step2")}</li>
          <li>
            {t("anilist.auth.step3")}{" "}
            <span className="text-text">
              https://anilist.co/api/v2/oauth/pin
            </span>
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
        <Input
          placeholder={t("anilist.auth.tokenPlaceholder")}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          onKeyDown={enterSubmit(() => {
            if (!loading) handleSubmit();
          })}
        />
        {error && (
          <span className="text-destructive windows95-text">{error}</span>
        )}
        <div className="mt-1 flex justify-end gap-1">
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? <SmallLoader /> : t("anilist.auth.save")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default AniListAuthModal;
