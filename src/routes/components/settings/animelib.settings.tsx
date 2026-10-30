import { useEffect, useRef, useState } from "react";

import { streamApi } from "@/api/stream.api";
import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import { PasswordInput } from "@/components/ui/password.component";
import Select from "@/components/ui/select.component";
import { PROXY_PRESETS, proxySelectValue } from "@/config/system/proxy.config";
import { useI18n } from "@/hooks/i18n.hook";
import { useCell } from "@/lib/core/signal.hook";
import { attempt } from "@/lib/core/attempt.utils";
import { ignore } from "@/lib/core/promise.utils";
import { patchSettings, settingsAtoms } from "@/store/settings.store";

import { SectionResetButton } from "@/routes/components/settings/reset.settings";

/**
 * AnimeLib session token. Kodik works anonymously, but the site's own
 * 1080p/4K rows are only returned to a logged-in session, and the site
 * expects the token on every API request. It lives in the OS keyring, not in
 * the settings store, so it is never written to disk with the preferences.
 */
export default function AnimelibSettings() {
  const { t } = useI18n();
  const proxyUrl = useCell(settingsAtoms.animelibProxyUrl);
  const proxyInputRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState("");
  const [hasToken, setHasToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [value, failure] = await attempt(streamApi.tokenStatus());
      if (cancelled) return;
      if (failure) setError(failure.message);
      else setHasToken(value);
    };
    ignore(load());
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    const token = input.trim();
    if (!token || saving) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    const [, failure] = await attempt(streamApi.tokenSave(token));
    if (failure) setError(failure.message);
    else {
      setInput("");
      setHasToken(true);
      setSaved(true);
    }
    setSaving(false);
  };

  const clear = async () => {
    setSaved(false);
    setError(null);
    const [, failure] = await attempt(streamApi.tokenClear());
    if (failure) setError(failure.message);
    else setHasToken(false);
  };

  return (
    <section className="ui-panel" data-find-section="general.animelib">
      <div className="ui-titlebar group flex items-center justify-between gap-1">
        <span className="text-title-text font-bold">{t("settings.animelib.title")}</span>
        <SectionResetButton sectionId="general.animelib" />
      </div>
      <div className="flex flex-col gap-1 p-2">
        <span className="text-hint text-[12px]">{t("settings.animelib.description")}</span>
        <div className="grid grid-cols-1 gap-x-3 gap-y-1.5 min-[560px]:grid-cols-[140px_1fr]">
          <span className="windows95-text text-text text-xs font-bold">
            {t("settings.animelib.proxy.url")}
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-hint text-[12px]">
              {t("settings.animelib.proxy.url.description")}
            </span>
            <div className="flex flex-col gap-1">
              <Select
                label={t("settings.animelib.proxy.url")}
                value={proxySelectValue(proxyUrl)}
                onChange={(value) => {
                  if (value === "custom") {
                    proxyInputRef.current?.focus();
                    return;
                  }
                  patchSettings({ animelibProxyUrl: value || null });
                }}
                options={[
                  { value: "", label: t("settings.animelib.proxy.no") },
                  ...PROXY_PRESETS.map((url) => ({ value: url, label: url })),
                  { value: "custom", label: t("settings.animelib.proxy.custom") },
                ]}
                className="w-full min-[560px]:max-w-60"
              />
              <Input
                ref={proxyInputRef}
                value={proxyUrl ?? ""}
                onChange={(event) =>
                  patchSettings({ animelibProxyUrl: event.target.value.trim() || null })
                }
                placeholder="socks5://127.0.0.1:10808"
                spellCheck={false}
                className="w-full min-[560px]:max-w-70"
                aria-label={t("settings.animelib.proxy.url")}
              />
            </div>
          </div>

          <span className="windows95-text text-text text-xs font-bold">
            {t("settings.animelib.token")}
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-hint text-[12px]">
              {t("settings.animelib.token.description")}
            </span>
            <PasswordInput
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={t("settings.animelib.token.placeholder")}
              spellCheck={false}
              wrapperClassName="w-full"
              aria-label={t("settings.animelib.token")}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                className="h-6 px-2 text-xs"
                onClick={save}
                disabled={saving || !input.trim()}
              >
                {t("settings.animelib.token.save")}
              </Button>
              <Button className="h-6 px-2 text-xs" onClick={clear} disabled={!hasToken}>
                {t("settings.animelib.token.clear")}
              </Button>
              <span className="windows95-text text-hint text-xs">
                {hasToken
                  ? t("settings.animelib.token.stored")
                  : t("settings.animelib.token.empty")}
              </span>
            </div>
            {error ? (
              <span className="text-destructive text-xs" role="alert">
                {error}
              </span>
            ) : null}
            {saved ? (
              <span className="text-hint text-xs">{t("settings.animelib.token.saved")}</span>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
