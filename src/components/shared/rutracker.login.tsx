import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Modal from "./modal.component";
import { Button } from "../ui/button.component";
import { Input } from "../ui/input.component";
import { SmallLoader } from "./loader.component";

// interface Props {
//   onSuccess: () => void;
//   onClose: () => void;
// }

function RutrackerLoginModal({
  setRutrackerAuth,
  setShowLogin,
}: {
  setRutrackerAuth: (value: boolean) => void;
  setShowLogin: (value: boolean) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSuccess = () => {
    setRutrackerAuth(true);
    setShowLogin(false);
  };

  const handleClose = () => {
    setShowLogin(false);
  };

  const handleSubmit = async () => {
    if (!username.trim() || !password.trim()) return;
    setLoading(true);
    setError("");
    try {
      await invoke("rutracker_login", {
        username: username.trim(),
        password,
      });
      handleSuccess();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal header="Rutracker -> войти в аккаунт" onClose={handleClose}>
      <div className="flex flex-col gap-2 p-1">
        <Input
          placeholder="Имя пользователя"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !loading && handleSubmit()}
        />
        <Input
          type="password"
          placeholder="Пароль"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !loading && handleSubmit()}
        />
        {error && (
          <span className="text-destructive windows95-text text-[11px]">
            {error}
          </span>
        )}
        <div className="flex gap-1 justify-end mt-1">
          <Button onClick={handleClose}>Отмена</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? <SmallLoader /> : "Войти"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default RutrackerLoginModal;
