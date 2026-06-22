import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Modal from "../../components/shared/modal.component";
import { Button } from "../../components/ui/button.component";
import { Input } from "../../components/ui/input.component";
import { SmallLoader } from "../../components/shared/loader.component";

function NekoBtApiModal({
  setNekoBtAuth,
  setShowApiModal,
}: {
  setNekoBtAuth: (value: boolean) => void;
  setShowApiModal: (value: boolean) => void;
}) {
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
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal header="nekoBT -> ввести API ключ" onClose={handleClose}>
      <div className="flex flex-col gap-2 p-1">
        <span className="windows95-text">API ключ nekoBT</span>
        <Input
          placeholder="API ключ"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !loading && handleSubmit()}
        />
        {error && (
          <span className="text-destructive windows95-text">{error}</span>
        )}
        <div className="flex gap-1 justify-end mt-1">
          <Button onClick={handleClose}>Отмена</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? <SmallLoader /> : "Сохранить"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default NekoBtApiModal;
