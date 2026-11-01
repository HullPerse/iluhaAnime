import { cn } from "cn";
import { useRef, useState } from "react";

import { anilistApi } from "@/api/anilist.api";
import { tmdbApi } from "@/api/tmdb.api";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import { Input } from "@/components/ui/input.component";
import { PasswordInput } from "@/components/ui/password.component";
import Select from "@/components/ui/select.component";
import { PROXY_PRESETS, proxySelectValue } from "@/config/system/proxy.config";
import { useI18n } from "@/hooks/i18n.hook";
import { useOnlineStatus } from "@/hooks/network.hook";
import { attempt } from "@/lib/core/attempt.utils";
import { isValidProxyUrl } from "@/lib/core/proxy.utils";
import { useCell } from "@/lib/core/signal.hook";
import { patchSettings, settingsAtoms } from "@/store/settings.store";

import AnimelibSettings from "@/routes/components/settings/animelib.settings";
import { SectionResetButton } from "@/routes/components/settings/reset.settings";

const TMDB_PROXY_PRESETS = [
  "socks5://127.0.0.1:10808",
  "socks5://127.0.0.1:1080",
  "socks5h://127.0.0.1:10808",
  "http://127.0.0.1:7890",
  "http://127.0.0.1:10809",
  "http://127.0.0.1:8080",
];

function tmdbProxySelectValue(value: string | null = null): string {
  if (value === null || value === "") return "";
  if (TMDB_PROXY_PRESETS.includes(value)) return value;
  return "custom";
}

export default function SettingsProxy() {
  const { t } = useI18n();
  const isOnline = useOnlineStatus();
  const tmdbKeySet = useCell(settingsAtoms.tmdbKeySet);
  const tmdbProxyUrl = useCell(settingsAtoms.tmdbProxyUrl);
  const anilistProxyUrl = useCell(settingsAtoms.anilistProxyUrl);
  const anilistTitleLanguage = useCell(settingsAtoms.anilistTitleLanguage);
  const anilistAdultContent = useCell(settingsAtoms.anilistAdultContent);
  const [tmdbInput, setTmdbInput] = useState<string>("");
  const [tmdbSaving, setTmdbSaving] = useState<boolean>(false);
  const [tmdbTesting, setTmdbTesting] = useState<boolean>(false);
  const [tmdbTest, setTmdbTest] = useState<{ ok: boolean; msg: string } | null>(null);
  const [anilistTesting, setAnilistTesting] = useState<boolean>(false);
  const [anilistTest, setAnilistTest] = useState<{ ok: boolean; msg: string } | null>(null);
  const tmdbProxyInputRef = useRef<HTMLInputElement>(null);
  const anilistProxyInputRef = useRef<HTMLInputElement>(null);
  const tmdbProxyInvalid = !isValidProxyUrl(tmdbProxyUrl);
  const anilistProxyInvalid = !isValidProxyUrl(anilistProxyUrl);

  const handleTmdbSave = async () => {
    const key = tmdbInput.trim();
    if (!key || tmdbSaving) return;
    setTmdbSaving(true);
    const [, error] = await attempt(tmdbApi.setApiKey(key));
    if (error) setTmdbTest({ ok: false, msg: error.message });
    else {
      setTmdbInput("");
      patchSettings({ tmdbKeySet: true, tmdbPendingKey: null });
    }
    setTmdbSaving(false);
  };

  const handleTmdbRemove = async () => {
    const [, error] = await attempt(tmdbApi.logout());
    if (error) setTmdbTest({ ok: false, msg: error.message });
    else patchSettings({ tmdbKeySet: false });
  };

  const handleTmdbTest = async () => {
    setTmdbTesting(true);
    setTmdbTest(null);
    const [res, error] = await attempt(tmdbApi.testConnection());
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
      <section className="ui-panel" data-find-section="proxy.tmdb">
        <div className="ui-titlebar group flex items-center justify-between gap-1">
          <span className="text-title-text font-bold">{t("settings.tmdb.api.key")}</span>
          <SectionResetButton sectionId="proxy.tmdb" />
        </div>
        <div className="flex flex-col gap-1 p-2">
          <div className="grid grid-cols-1 gap-x-3 gap-y-1.5 min-[560px]:grid-cols-[140px_1fr]">
            <span className="windows95-text text-text text-xs font-bold">
              {t("settings.tmdb.api.key")}
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-hint text-xs">{t("settings.tmdb.api.key.description")}</span>
              <PasswordInput
                value={tmdbInput}
                onChange={(event) => setTmdbInput(event.target.value)}
                placeholder={t("settings.tmdb.api.key.placeholder")}
                spellCheck={false}
                wrapperClassName="w-full"
                aria-label={t("settings.tmdb.api.key")}
              />
              <div className="flex flex-wrap items-center gap-2">
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
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex flex-col gap-1">
                <Select
                  value={tmdbProxySelectValue(tmdbProxyUrl)}
                  onChange={(value) => {
                    if (value === "custom") {
                      tmdbProxyInputRef.current?.focus();
                      return;
                    }
                    patchSettings({ tmdbProxyUrl: value || null });
                  }}
                  options={[
                    { value: "", label: t("settings.tmdb.proxy.no") },
                    ...TMDB_PROXY_PRESETS.map((url) => ({ value: url, label: url })),
                    { value: "custom", label: t("settings.tmdb.proxy.custom") },
                  ]}
                  className="w-full min-[560px]:max-w-70"
                />
                <div className="flex items-center gap-1">
                  <Input
                    ref={tmdbProxyInputRef}
                    value={tmdbProxyUrl ?? ""}
                    onChange={(event) =>
                      patchSettings({ tmdbProxyUrl: event.target.value.trim() || null })
                    }
                    placeholder="socks5://127.0.0.1:10808"
                    spellCheck={false}
                    className="w-full min-[560px]:max-w-70"
                    aria-label={t("settings.tmdb.proxy.url")}
                    aria-invalid={tmdbProxyInvalid}
                  />
                </div>
                {tmdbProxyInvalid && (
                  <span className="text-destructive text-xs" role="alert">
                    {t("settings.proxy.invalid")}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  className="h-6 px-2 text-xs"
                  onClick={handleTmdbTest}
                  disabled={tmdbTesting || !isOnline}
                  title={isOnline ? undefined : t("tabs.offlineUnavailable")}
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

      <section className="ui-panel" data-find-section="proxy.anilist">
        <div className="ui-titlebar group flex items-center justify-between gap-1">
          <span className="text-title-text font-bold">{t("settings.anilist.proxy.title")}</span>
          <SectionResetButton sectionId="proxy.anilist" />
        </div>
        <div className="flex flex-col gap-1 p-2">
          <div className="grid grid-cols-1 gap-x-3 gap-y-1.5 min-[560px]:grid-cols-[140px_1fr]">
            <span className="windows95-text text-text text-xs font-bold">
              {t("settings.anilist.proxy.url")}
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex flex-col gap-1">
                <Select
                  value={proxySelectValue(anilistProxyUrl)}
                  onChange={(value) => {
                    if (value === "custom") {
                      anilistProxyInputRef.current?.focus();
                      return;
                    }
                    patchSettings({ anilistProxyUrl: value || null });
                  }}
                  options={[
                    { value: "", label: t("settings.anilist.proxy.no") },
                    ...PROXY_PRESETS.map((url) => ({ value: url, label: url })),
                    { value: "custom", label: t("settings.anilist.proxy.custom") },
                  ]}
                  className="w-full min-[560px]:max-w-70"
                />
                <div className="flex items-center gap-1">
                  <Input
                    ref={anilistProxyInputRef}
                    value={anilistProxyUrl ?? ""}
                    onChange={(event) =>
                      patchSettings({ anilistProxyUrl: event.target.value.trim() || null })
                    }
                    placeholder="socks5://127.0.0.1:10808"
                    spellCheck={false}
                    className="w-full min-[560px]:max-w-70"
                    aria-label={t("settings.anilist.proxy.url")}
                    aria-invalid={anilistProxyInvalid}
                  />
                </div>
                {anilistProxyInvalid && (
                  <span className="text-destructive text-xs" role="alert">
                    {t("settings.proxy.invalid")}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  className="h-6 px-2 text-xs"
                  onClick={handleAnilistTest}
                  disabled={anilistTesting || !isOnline}
                  title={isOnline ? undefined : t("tabs.offlineUnavailable")}
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

            <span className="windows95-text text-text flex items-center text-xs font-bold">
              {t("settings.anilist.title.language")}
            </span>
            <div className="group flex min-w-0 items-center gap-1">
              <Select
                value={anilistTitleLanguage}
                onChange={(value) => patchSettings({ anilistTitleLanguage: value })}
                options={[
                  { value: "account", label: t("settings.anilist.title.account") },
                  { value: "romaji", label: t("settings.anilist.title.romaji") },
                  { value: "english", label: t("settings.anilist.title.english") },
                  { value: "native", label: t("settings.anilist.title.native") },
                ]}
                className="w-52"
              />
            </div>

            <span className="windows95-text text-destructive flex items-center text-xs font-bold">
              {t("settings.anilist.adult")}
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <label className="group windows95-text text-text flex cursor-pointer items-center gap-2 select-none">
                <Checkbox
                  checked={anilistAdultContent}
                  onChange={(value) => patchSettings({ anilistAdultContent: value })}
                />
                <span>{t("settings.anilist.adult.description")}</span>
              </label>
            </div>
          </div>
        </div>
      </section>

      <AnimelibSettings />
    </div>
  );
}
