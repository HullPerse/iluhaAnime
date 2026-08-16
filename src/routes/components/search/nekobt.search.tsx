import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";

import { SmallLoader } from "@/components/shared/loader.component";
import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import { useI18n } from "@/lib/i18n";
import { enterSubmit } from "@/lib/keyboard.utils";

function NekoBtApiModal({
  setNekoBtAuth,
  setShowApiModal,
}: {
  setNekoBtAuth: (value: boolean) => void;
  setShowApiModal: (value: boolean) => void;
}) {
  const { t } = useI18n();
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSuccess = () => {
    setNekoBtAuth(true);
    setShowApiModal(false);
  };

  const handleClose = () => {
    setShowApiModal(false);
  };

  const handleSubmit = async () => {
    if (!apiKey.trim()) return;
    setLoading(true);
    setError("");
    try {
      await invoke("nekobt_set_api_key", { apiKey: apiKey.trim() });
      handleSuccess();
    } catch (error) {
      setError(String(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      header={t("search.nekobt.title")}
      onClose={handleClose}
      className="w-xl"
    >
      <div className="flex flex-col gap-2 p-1">
        <span className="windows95-text">{t("search.nekobt.apiKey")}</span>
        <Input
          placeholder={t("search.nekobt.placeholder")}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          onKeyDown={enterSubmit(() => {
            if (!loading) handleSubmit();
          })}
        />
        {error && (
          <span className="text-destructive windows95-text">{error}</span>
        )}
        <div className="mt-1 flex justify-end gap-1">
          <Button onClick={handleClose}>{t("common.cancel")}</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? <SmallLoader /> : t("search.nekobt.save")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default NekoBtApiModal;
