import { useState } from "react";

import { torrentApi } from "@/api/torrent.api";
import { SmallLoader } from "@/components/shared/loader.component";
import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import { PasswordInput } from "@/components/ui/password.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import { mapError } from "@/lib/search/rutracker.utils";
import { attempt } from "@/lib/utils/attempt.utils";
import { enterSubmit } from "@/lib/utils/keyboard.utils";
import { useSettingsStore } from "@/store/settings.store";

function RutrackerLoginModal({
  setRutrackerAuth,
  setShowLogin,
}: {
  setRutrackerAuth: (value: boolean) => void;
  setShowLogin: (value: boolean) => void;
}) {
  const { t } = useI18n();
  const rutrackerProxy = useSettingsStore((s) => s.searchProxyUrls["rutracker"] ?? "");
  const [mode, setMode] = useState<"login" | "cookies" | "browser">(
    rutrackerProxy.trim() ? "cookies" : "login"
  );
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [cookies, setCookies] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSuccess = () => {
    setRutrackerAuth(true);
    setShowLogin(false);
  };

  const handleClose = () => {
    setShowLogin(false);
  };

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) return;
    setLoading(true);
    setError("");
    const [, error] = await attempt(torrentApi.rutrackerLogin(username, password));
    if (error) {
      const raw = String(error);
      setError(mapError(raw, t));
      if (raw.trim().startsWith("blocked:")) setMode("browser");
    } else handleSuccess();
    setLoading(false);
  };

  const handleSaveCookies = async () => {
    if (!cookies.trim()) return;
    setLoading(true);
    setError("");
    const [, error] = await attempt(torrentApi.rutrackerSetCookies(cookies));
    if (error) setError(mapError(String(error), t));
    else handleSuccess();
    setLoading(false);
  };

  const handleOpenBrowser = async () => {
    setLoading(true);
    setError("");
    const [, error] = await attempt(torrentApi.rutrackerWebviewLogin());
    if (error) setError(mapError(String(error), t));
    setLoading(false);
  };

  const handleSaveBrowserSession = async () => {
    setLoading(true);
    setError("");
    const [, error] = await attempt(torrentApi.rutrackerFinishWebviewLogin());
    if (error) setError(mapError(String(error), t));
    else handleSuccess();
    setLoading(false);
  };

  return (
    <Modal header={t("search.rutracker.title")} onClose={handleClose} className="w-xl">
      <div className="flex flex-col gap-2 p-1">
        <div className="flex gap-1">
          <Button
            variant={mode === "login" ? "default" : "ghost"}
            size="default"
            onClick={() => {
              setMode("login");
              setError("");
            }}
            disabled={mode === "login"}
          >
            {t("search.rutracker.login.tab")}
          </Button>
          <Button
            variant={mode === "cookies" ? "default" : "ghost"}
            size="default"
            onClick={() => {
              setMode("cookies");
              setError("");
            }}
            disabled={mode === "cookies"}
          >
            {t("search.rutracker.cookies.tab")}
          </Button>
          <Button
            variant={mode === "browser" ? "default" : "ghost"}
            size="default"
            onClick={() => {
              setMode("browser");
              setError("");
            }}
            disabled={mode === "browser"}
          >
            {t("search.rutracker.browser.tab")}
          </Button>
        </div>

        {mode === "login" ? (
          <div className="flex flex-col gap-2">
            <Input
              placeholder={t("search.rutracker.username")}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={enterSubmit(() => {
                if (!loading) handleLogin();
              })}
            />
            <PasswordInput
              placeholder={t("search.rutracker.password")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={enterSubmit(() => {
                if (!loading) handleLogin();
              })}
            />
          </div>
        ) : mode === "cookies" ? (
          <div className="flex flex-col gap-2">
            <textarea
              value={cookies}
              onChange={(e) => setCookies(e.target.value)}
              placeholder="bb_session=...; bb_data=...; uid=..."
              spellCheck={false}
              className="windows95-border windows95-text placeholder:text-hint focus-visible:outline-text bg-field h-28 w-full resize-y p-1 outline-none focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-dotted"
            />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Button onClick={handleOpenBrowser} disabled={loading}>
              {loading ? <SmallLoader /> : t("search.rutracker.open.browser")}
            </Button>
          </div>
        )}

        {error && <span className="text-destructive windows95-text">{error}</span>}
        <div className="mt-1 flex justify-end gap-1">
          <Button onClick={handleClose}>{t("common.cancel")}</Button>
          {mode === "login" ? (
            <Button
              onClick={handleLogin}
              disabled={loading || !username.trim() || !password.trim()}
            >
              {loading ? <SmallLoader /> : t("search.rutracker.login")}
            </Button>
          ) : mode === "cookies" ? (
            <Button onClick={handleSaveCookies} disabled={loading || !cookies.trim()}>
              {loading ? <SmallLoader /> : t("search.rutracker.save.cookies")}
            </Button>
          ) : (
            <Button onClick={handleSaveBrowserSession} disabled={loading}>
              {loading ? <SmallLoader /> : t("search.rutracker.save.browser.session")}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default RutrackerLoginModal;
