import { cn } from "cn";
import { useRef, useState } from "react";

import { anilistApi } from "@/api/anilist.api";
import { ConfirmDialog } from "@/components/shared/confirm.component";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import { Input } from "@/components/ui/input.component";
import { PasswordInput } from "@/components/ui/password.component";
import Select from "@/components/ui/select.component";
import { DEFAULT_SETTINGS } from "@/config/settings/defaults.config";
import { useI18n } from "@/lib/locale/i18n.utils";
import { applyWindowChrome } from "@/lib/settings/window.utils";
import { attempt, attemptSync } from "@/lib/utils/attempt.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { useSettingsStore } from "@/store/settings.store";
import type { Locale } from "@/types/i18n";
import type { SettingsStore } from "@/types/settings";

import SettingsMedia from "./media.settings";

export default function SettingsGeneral() {
  const {
    language,
    parseTitles,
    sqliteBrowserEnabled,
    collectionTabEnabled,
    anilistTabEnabled,
    minimizeToTray,
    tmdbKeySet,
    tmdbProxyUrl,
    anilistProxyUrl,
    ffmpegSource,
    patch,
  } = useSettingsStore();
  const { t } = useI18n();
  const [pendingClear, setPendingClear] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [tmdbTesting, setTmdbTesting] = useState(false);
  const [tmdbTest, setTmdbTest] = useState<{ ok: boolean; msg: string } | null>(null);
  const tmdbProxyInputRef = useRef<HTMLInputElement>(null);
  const [anilistTesting, setAnilistTesting] = useState(false);
  const [anilistTest, setAnilistTest] = useState<{ ok: boolean; msg: string } | null>(null);
  const anilistProxyInputRef = useRef<HTMLInputElement>(null);
  const [tmdbInput, setTmdbInput] = useState("");
  const [tmdbSaving, setTmdbSaving] = useState(false);
  const handleTmdbSave = async () => {
    const key = tmdbInput.trim();
    if (!key || tmdbSaving) return;
    setTmdbSaving(true);
    const [, error] = await attempt(invokeTyped<string>("tmdb_set_api_key", { api_key: key }));
    if (error) setTmdbTest({ ok: false, msg: error.message });
    else {
      setTmdbInput("");
      patch({ tmdbKeySet: true, tmdbPendingKey: null });
    }
    setTmdbSaving(false);
  };
  const handleTmdbRemove = async () => {
    const [, error] = await attempt(invokeTyped<string>("tmdb_logout"));
    if (error) setTmdbTest({ ok: false, msg: error.message });
    else patch({ tmdbKeySet: false });
  };

  const handleTmdbTest = async () => {
    setTmdbTesting(true);
    setTmdbTest(null);
    const [res, error] = await attempt(
      invokeTyped<string>("test_tmdb_connection", {
        proxyUrl: tmdbProxyUrl,
        proxy_url: tmdbProxyUrl,
      })
    );
    if (error) setTmdbTest({ ok: false, msg: error.message });
    else setTmdbTest({ ok: true, msg: res });
    setTmdbTesting(false);
  };
  const handleAnilistTest = async () => {
    setAnilistTesting(true);
    setAnilistTest(null);
    const [res, error] = await attempt(anilistApi.testConnection());
    if (error) setAnilistTest({ ok: false, msg: error.message });
    else setAnilistTest({ ok: true, msg: res });
    setAnilistTesting(false);
  };

  return (
    <div className="flex flex-col gap-3">
      <section className="ui-panel">
        <div className="ui-titlebar">
          <span className="text-title-text font-bold">{t("settings.tabs")}</span>
        </div>
        <div className="flex flex-col gap-1 p-2">
          <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1">
            <span />
            <div className="flex flex-col gap-4">
              <label className="windows95-text text-text flex cursor-pointer items-center gap-1.5 select-none">
                <Checkbox
                  checked={collectionTabEnabled}
                  onChange={(v) => patch({ collectionTabEnabled: v })}
                />
                <span className="text-xs">{t("settings.collection.tab")}</span>
              </label>
              <label className="windows95-text text-text flex cursor-pointer items-center gap-1.5 select-none">
                <Checkbox
                  checked={anilistTabEnabled}
                  onChange={(v) => patch({ anilistTabEnabled: v })}
                />
                <span className="text-xs">{t("settings.anilist.tab")}</span>
              </label>
              <label
                className="windows95-text text-text flex cursor-pointer items-center gap-1.5 select-none"
                title={t("settings.sqlite.browser.description")}
              >
                <Checkbox
                  checked={sqliteBrowserEnabled}
                  onChange={(v) => patch({ sqliteBrowserEnabled: v })}
                />
                <span className="text-xs">{t("settings.sqlite")}</span>
              </label>
            </div>
          </div>
        </div>
      </section>

      <section className="ui-panel">
        <div className="ui-titlebar">
          <span className="text-title-text font-bold">{t("settings.window")}</span>
        </div>
        <div className="flex flex-col gap-1 p-2">
          <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1">
            <span className="windows95-text text-text flex items-center text-xs font-bold">
              {t("settings.window")}
            </span>
            <div className="flex flex-col gap-0.5">
              <label className="windows95-text text-text flex cursor-pointer items-center gap-1.5 select-none">
                <Checkbox checked={minimizeToTray} onChange={(v) => patch({ minimizeToTray: v })} />
                <span className="text-xs">{t("settings.tray.minimize")}</span>
              </label>
              <span className="text-hint text-[12px]">
                {t("settings.tray.minimize.description")}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="ui-panel">
        <div className="ui-titlebar">
          <span className="text-title-text font-bold">{t("settings.language")}</span>
        </div>
        <div className="flex flex-col gap-1 p-2">
          <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1.5">
            <span className="windows95-text text-text flex items-center text-xs font-bold">
              {t("settings.language")}
            </span>
            <div className="flex flex-col gap-0.5">
              <Select
                value={language}
                onChange={(value) => patch({ language: value as Locale })}
                options={[
                  { value: "ru", label: t("settings.language.ru") },
                  { value: "en", label: t("settings.language.en") },
                ]}
                className="w-32"
              />
            </div>

            <span className="windows95-text text-text flex items-center text-xs font-bold">
              {t("settings.ffmpeg.source")}
            </span>
            <div className="flex flex-col gap-0.5">
              <Select
                value={ffmpegSource}
                onChange={(value) =>
                  patch({ ffmpegSource: value as SettingsStore["ffmpegSource"] })
                }
                options={[
                  {
                    value: "essentials",
                    label: t("settings.ffmpeg.source.essentials"),
                  },
                  { value: "github", label: t("settings.ffmpeg.source.github") },
                  {
                    value: "github-mirror",
                    label: t("settings.ffmpeg.source.mirror"),
                  },
                ]}
                className="w-52"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="ui-panel">
        <div className="ui-titlebar">
          <span className="text-title-text font-bold">{t("settings.tmdb.api.key")}</span>
        </div>
        <div className="flex flex-col gap-1 p-2">
          <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1.5">
            <span className="windows95-text text-text text-xs font-bold">
              {t("settings.tmdb.api.key")}
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="text-hint text-[12px]">
                {t("settings.tmdb.api.key.description")}
              </span>
              <PasswordInput
                value={tmdbInput}
                onChange={(e) => setTmdbInput(e.target.value)}
                placeholder={t("settings.tmdb.api.key.placeholder")}
                spellCheck={false}
                wrapperClassName="w-full max-w-130"
                aria-label={t("settings.tmdb.api.key")}
              />
              <div className="flex items-center gap-2">
                <Button
                  className="h-6 px-2 text-xs"
                  onClick={handleTmdbSave}
                  disabled={tmdbSaving || !tmdbInput.trim()}
                >
                  {t("settings.tmdb.api.key.save")}
                </Button>
                <Button
                  className="h-6 px-2 text-xs"
                  onClick={handleTmdbRemove}
                  disabled={!tmdbKeySet}
                >
                  {t("settings.tmdb.api.key.remove")}
                </Button>
                <span className="windows95-text text-hint text-xs">
                  {tmdbKeySet
                    ? t("settings.tmdb.api.key.stored")
                    : t("settings.tmdb.api.key.empty")}
                </span>
              </div>
            </div>

            <span className="windows95-text text-text text-xs font-bold">
              {t("settings.tmdb.proxy.url")}
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="text-hint text-[12px]">
                {t("settings.tmdb.proxy.url.description")}
              </span>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center">
                <Select
                  value={(() => {
                    const p = tmdbProxyUrl ?? "";
                    const presets = [
                      "socks5://127.0.0.1:10808",
                      "socks5://127.0.0.1:1080",
                      "socks5h://127.0.0.1:10808",
                      "http://127.0.0.1:7890",
                      "http://127.0.0.1:10809",
                      "http://127.0.0.1:8080",
                    ];
                    if (p === "") return "";
                    if (presets.includes(p)) return p;
                    return "custom";
                  })()}
                  onChange={(v) => {
                    if (v === "custom") {
                      tmdbProxyInputRef.current?.focus();
                      return;
                    }
                    patch({ tmdbProxyUrl: v || null });
                  }}
                  options={[
                    { value: "", label: t("settings.tmdb.proxy.no") },
                    {
                      value: "socks5://127.0.0.1:10808",
                      label: "socks5://127.0.0.1:10808",
                    },
                    {
                      value: "socks5://127.0.0.1:1080",
                      label: "socks5://127.0.0.1:1080",
                    },
                    {
                      value: "socks5h://127.0.0.1:10808",
                      label: "socks5h://127.0.0.1:10808",
                    },
                    {
                      value: "http://127.0.0.1:7890",
                      label: "http://127.0.0.1:7890",
                    },
                    {
                      value: "http://127.0.0.1:10809",
                      label: "http://127.0.0.1:10809",
                    },
                    {
                      value: "http://127.0.0.1:8080",
                      label: "http://127.0.0.1:8080",
                    },
                    { value: "custom", label: t("settings.tmdb.proxy.custom") },
                  ]}
                  className="w-full max-w-60"
                />
                <Input
                  ref={tmdbProxyInputRef}
                  value={tmdbProxyUrl ?? ""}
                  onChange={(e) => patch({ tmdbProxyUrl: e.target.value.trim() || null })}
                  placeholder="socks5://127.0.0.1:10808"
                  spellCheck={false}
                  className="w-full max-w-70"
                  aria-label={t("settings.tmdb.proxy.url")}
                />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  className="h-6 px-2 text-xs"
                  onClick={handleTmdbTest}
                  disabled={tmdbTesting}
                >
                  {tmdbTesting ? t("settings.tmdb.proxy.testing") : t("settings.tmdb.proxy.test")}
                </Button>
                {tmdbTest && (
                  <span
                    className={cn(
                      "windows95-text text-xs",
                      tmdbTest.ok ? "text-success" : "text-destructive"
                    )}
                  >
                    {tmdbTest.ok
                      ? `${t("settings.tmdb.proxy.test.ok")} - ${tmdbTest.msg}`
                      : `${t("settings.tmdb.proxy.test.fail")}: ${tmdbTest.msg}`}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="ui-panel">
        <div className="ui-titlebar">
          <span className="text-title-text font-bold">{t("settings.anilist.proxy.title")}</span>
        </div>
        <div className="flex flex-col gap-1 p-2">
          <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1.5">
            <span className="windows95-text text-text text-xs font-bold">
              {t("settings.anilist.proxy.url")}
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="text-hint text-[12px]">
                {t("settings.anilist.proxy.url.description")}
              </span>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center">
                <Select
                  value={(() => {
                    const p = anilistProxyUrl ?? "";
                    const presets = [
                      "socks5://127.0.0.1:10808",
                      "socks5://127.0.0.1:1080",
                      "socks5h://127.0.0.1:10808",
                      "http://127.0.0.1:7890",
                      "http://127.0.0.1:10809",
                      "http://127.0.0.1:8080",
                    ];
                    if (p === "") return "";
                    if (presets.includes(p)) return p;
                    return "custom";
                  })()}
                  onChange={(v) => {
                    if (v === "custom") {
                      anilistProxyInputRef.current?.focus();
                      return;
                    }
                    patch({ anilistProxyUrl: v || null });
                  }}
                  options={[
                    { value: "", label: t("settings.anilist.proxy.no") },
                    {
                      value: "socks5://127.0.0.1:10808",
                      label: "socks5://127.0.0.1:10808",
                    },
                    {
                      value: "socks5://127.0.0.1:1080",
                      label: "socks5://127.0.0.1:1080",
                    },
                    {
                      value: "socks5h://127.0.0.1:10808",
                      label: "socks5h://127.0.0.1:10808",
                    },
                    {
                      value: "http://127.0.0.1:7890",
                      label: "http://127.0.0.1:7890",
                    },
                    {
                      value: "http://127.0.0.1:10809",
                      label: "http://127.0.0.1:10809",
                    },
                    {
                      value: "http://127.0.0.1:8080",
                      label: "http://127.0.0.1:8080",
                    },
                    { value: "custom", label: t("settings.anilist.proxy.custom") },
                  ]}
                  className="w-full max-w-60"
                />
                <Input
                  ref={anilistProxyInputRef}
                  value={anilistProxyUrl ?? ""}
                  onChange={(e) => patch({ anilistProxyUrl: e.target.value.trim() || null })}
                  placeholder="socks5://127.0.0.1:10808"
                  spellCheck={false}
                  className="w-full max-w-70"
                  aria-label={t("settings.anilist.proxy.url")}
                />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  className="h-6 px-2 text-xs"
                  onClick={handleAnilistTest}
                  disabled={anilistTesting}
                >
                  {anilistTesting
                    ? t("settings.anilist.proxy.testing")
                    : t("settings.anilist.proxy.test")}
                </Button>
                {anilistTest && (
                  <span
                    className={cn(
                      "windows95-text text-xs",
                      anilistTest.ok ? "text-success" : "text-destructive"
                    )}
                  >
                    {anilistTest.ok
                      ? `${t("settings.anilist.proxy.test.ok")} - ${anilistTest.msg}`
                      : `${t("settings.anilist.proxy.test.fail")}: ${anilistTest.msg}`}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="ui-panel">
        <div className="ui-titlebar">
          <span className="text-title-text font-bold">{t("settings.parse.titles")}</span>
        </div>
        <div className="flex flex-col gap-1 p-2">
          <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1.5">
            <span className="windows95-text text-text text-xs font-bold">
              {t("settings.parse.titles")}
            </span>
            <div className="flex flex-col gap-0.5">
              <label className="windows95-text text-text flex cursor-pointer items-center gap-2 select-none">
                <Checkbox
                  checked={parseTitles}
                  onChange={(v) => {
                    patch({ parseTitles: v });
                  }}
                />
                <span>{t("common.on")}</span>
              </label>
            </div>
          </div>
        </div>
      </section>

      <SettingsMedia />

      <hr className="border-muted my-1 w-full border-t" />

      <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1.5">
        <span className="windows95-text text-destructive text-xs font-bold">
          {t("settings.reset.data")}
        </span>
        <div className="flex flex-col gap-1">
          <Button
            variant="destructive"
            className="w-fit"
            onClick={() => {
              setResetError(null);
              setPendingClear(true);
            }}
          >
            {t("settings.reset.button")}
          </Button>
        </div>
      </div>

      {pendingClear && (
        <ConfirmDialog
          open
          title={t("settings.reset.title")}
          message={resetError ?? t("settings.reset.message")}
          confirmLabel={t("common.delete")}
          variant="destructive"
          onConfirm={async () => {
            const [, error] = await attempt(invokeTyped("reset_sqlite_data"));
            if (error) {
              setResetError(error.message);
              return;
            }
            attemptSync(() => {
              for (const key of [
                "settings",
                "searchState",
                "themeState",
                "lastSaveDir",
                "cache",
                "categories",
                "collection-ui",
                "anilistFriends",
                "anilistReleaseObservations",
                "notifications",
              ]) {
                localStorage.removeItem(key);
              }
            });
            await applyWindowChrome(DEFAULT_SETTINGS);
            window.location.reload();
          }}
          onCancel={() => setPendingClear(false)}
          onClose={() => setPendingClear(false)}
        />
      )}
    </div>
  );
}
