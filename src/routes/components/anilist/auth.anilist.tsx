import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import { SmallLoader } from "@/components/shared/loader.component";

interface AniUser {
  id: number;
  name: string;
  avatar: string | null;
  anime_count: number;
  episodes_watched: number;
  mean_score: number | null;
}

function AniListAuthModal({
  onAuth,
  onClose,
}: {
  onAuth: (user: AniUser) => void;
  onClose: () => void;
}) {
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
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal header="AniList → токен доступа" onClose={onClose}>
      <div className="flex flex-col gap-2 p-1">
        <span className="windows95-text text-[11px]">
          Вставьте ваш токен доступа AniList
        </span>
        <ul className="text-[10px] windows95-text list-disc pl-4">
          <li>
            Зайдите на{" "}
            <a
              className="underline"
              href="https://anilist.co/settings/developer"
              target="_blank"
              rel="noreferrer"
            >
              anilist.co/settings/developer
            </a>
          </li>
          <li>Создайте приложение</li>
          <li>
            Вставьте redirect URL:{" "}
            <span className="text-text">
              https://anilist.co/api/v2/oauth/pin
            </span>
          </li>
          <li>скопируйте Client ID</li>
          <li>
            Откройте:{" "}
            <span className="text-text">
              https://anilist.co/api/v2/oauth/authorize?client_id=ВАШ_CLIENT_ID&response_type=token
            </span>
          </li>
          <li>Подтвердите → скопируйте access_token из URL</li>
          <li>Вставьте токен ниже</li>
        </ul>
        <Input
          placeholder="Токен доступа"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !loading && handleSubmit()}
        />
        {error && (
          <span className="text-destructive windows95-text">{error}</span>
        )}
        <div className="flex gap-1 justify-end mt-1">
          <Button onClick={onClose}>Отмена</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? <SmallLoader /> : "Сохранить"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default AniListAuthModal;
