import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";

import { SmallLoader } from "@/components/shared/loader.component";
import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import { PasswordInput } from "@/components/ui/password.component";
import { useI18n } from "@/lib/i18n";
import { enterSubmit } from "@/lib/keyboard.utils";
import type { TranslationKey } from "@/lib/i18n";

type RutrackerErrorCode =
  | "wrong_credentials"
  | "blocked"
  | "network"
  | "login_failed"
  | "session_failed"
  | "cookies_invalid"
  | "cookies_parse"
  | "webview_open"
  | "webview_save"
  | "webview_not_found"
  | "no_cookies"
  | "no_session";

const ERROR_KEYS: Record<RutrackerErrorCode, TranslationKey> = {
  wrong_credentials: "search.rutracker.errWrongCredentials",
  blocked: "search.rutracker.errBlocked",
  network: "search.rutracker.errNetwork",
  login_failed: "search.rutracker.errLoginFailed",
  session_failed: "search.rutracker.errSessionFailed",
  cookies_invalid: "search.rutracker.errCookiesInvalid",
  cookies_parse: "search.rutracker.errCookiesParse",
  webview_open: "search.rutracker.errWebviewOpen",
  webview_save: "search.rutracker.errWebviewSave",
  webview_not_found: "search.rutracker.errWebviewNotFound",
  no_cookies: "search.rutracker.errNoCookies",
  no_session: "search.rutracker.errNoSession",
};

function mapError(raw: string, t: (key: TranslationKey) => string): string {
  const code = raw.split(":")[0].trim() as RutrackerErrorCode;
  const label = t(ERROR_KEYS[code] ?? "search.rutracker.errUnknown");
  if (code === "network") {
    const detail = raw.split(":").slice(1).join(":").trim();
    if (detail) return `${label}\n${detail}`;
  }
  return label;
}

function RutrackerLoginModal({
  setRutrackerAuth,
  setShowLogin,
}: {
  setRutrackerAuth: (value: boolean) => void;
  setShowLogin: (value: boolean) => void;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"login" | "cookies" | "browser">("login");
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
    try {
      await invoke("rutracker_login", {
        username: username.trim(),
        password,
      });
      handleSuccess();
    } catch (error) {
      const raw = String(error);
      setError(mapError(raw, t));
      if (raw.trim().startsWith("blocked:")) setMode("browser");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCookies = async () => {
    if (!cookies.trim()) return;
    setLoading(true);
    setError("");
    try {
      await invoke("rutracker_set_cookies", { cookies: cookies.trim() });
      handleSuccess();
    } catch (error) {
      setError(mapError(String(error), t));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenBrowser = async () => {
    setLoading(true);
    setError("");
    try {
      await invoke("rutracker_webview_login");
    } catch (error) {
      setError(mapError(String(error), t));
    } finally {
      setLoading(false);
    }
  };

  const handleSaveBrowserSession = async () => {
    setLoading(true);
    setError("");
    try {
      await invoke("rutracker_finish_webview_login");
      handleSuccess();
    } catch (error) {
      setError(mapError(String(error), t));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      header={t("search.rutracker.title")}
      onClose={handleClose}
      className="w-xl"
    >
      <div className="flex flex-col gap-2 p-1">
        <div className="flex gap-1">
          <Button
            variant={mode === "login" ? "default" : "ghost"}
            size="default"
            onClick={() => {
              setMode("login");
              setError("");
            }}
          >
            {t("search.rutracker.loginTab")}
          </Button>
          <Button
            variant={mode === "cookies" ? "default" : "ghost"}
            size="default"
            onClick={() => {
              setMode("cookies");
              setError("");
            }}
          >
            {t("search.rutracker.cookiesTab")}
          </Button>
          <Button
            variant={mode === "browser" ? "default" : "ghost"}
            size="default"
            onClick={() => {
              setMode("browser");
              setError("");
            }}
          >
            {t("search.rutracker.browserTab")}
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
            <span className="windows95-text text-muted text-[9px] leading-snug">
              {t("search.rutracker.cookiesHint")}
            </span>
            <textarea
              value={cookies}
              onChange={(e) => setCookies(e.target.value)}
              placeholder="bb_session=...; bb_data=...; uid=..."
              spellCheck={false}
              className="windows95-border windows95-text placeholder:text-muted focus-visible:outline-text h-28 w-full resize-y bg-white p-1 outline-none focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-dotted"
            />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <span className="windows95-text text-muted text-[9px] leading-snug">
              {t("search.rutracker.browserHint")}
            </span>
            <Button onClick={handleOpenBrowser} disabled={loading}>
              {loading ? <SmallLoader /> : t("search.rutracker.openBrowser")}
            </Button>
          </div>
        )}

        {error && (
          <span className="text-destructive windows95-text">{error}</span>
        )}
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
            <Button
              onClick={handleSaveCookies}
              disabled={loading || !cookies.trim()}
            >
              {loading ? <SmallLoader /> : t("search.rutracker.saveCookies")}
            </Button>
          ) : (
            <Button onClick={handleSaveBrowserSession} disabled={loading}>
              {loading ? (
                <SmallLoader />
              ) : (
                t("search.rutracker.saveBrowserSession")
              )}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default RutrackerLoginModal;
