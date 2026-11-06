import { useState } from "react";

import { streamApi } from "@/api/stream.api";
import { Button } from "@/components/ui/button.component";
import { PasswordInput } from "@/components/ui/password.component";
import { useI18n } from "@/hooks/i18n.hook";
import { useOnlineStatus } from "@/hooks/network.hook";
import { useAnimelibAccount } from "@/hooks/stream/animelibAccount.hook";
import { attempt } from "@hullperse/hp_utils/attempt";
import { isValidProxyUrl } from "@/lib/core/system/proxy.utils";
import { useCell } from "@hullperse/hp_utils/react";
import { animelibAccountLabel } from "@/lib/stream/animelibAccount.utils";
import { patchSettings, settingsAtoms } from "@/store/settings.store";

import { ProxyField } from "@/routes/components/settings/proxy/proxyField.settings";
import { SectionResetButton } from "@/routes/components/settings/reset.settings";

export default function AnimelibSettings() {
  const { t } = useI18n();
  const isOnline = useOnlineStatus();
  const proxyUrl = useCell(settingsAtoms.animelibProxyUrl);
  const proxyInvalid = !isValidProxyUrl(proxyUrl);
  const { account, waiting, error: loginError, login, refresh } = useAnimelibAccount();
  const [input, setInput] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);
  const [saved, setSaved] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

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
      setSaved(true);
      await refresh();
    }
    setSaving(false);
  };

  const clear = async () => {
    setSaved(false);
    setError(null);
    const [, failure] = await attempt(streamApi.tokenClear());
    if (failure) setError(failure.message);
    else await refresh();
  };

  return (
    <section className="ui-panel" data-find-section="proxy.animelib">
      <div className="ui-titlebar group flex items-center justify-between gap-1">
        <span className="text-title-text font-bold">{t("settings.animelib.title")}</span>
        <SectionResetButton sectionId="proxy.animelib" />
      </div>
      <div className="flex flex-col gap-1 p-2">
        <div className="grid grid-cols-1 gap-x-3 gap-y-1.5 min-[560px]:grid-cols-[140px_1fr]">
          <span className="windows95-text text-text text-xs font-bold">
            {t("settings.animelib.token")}
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-hint text-[12px]">
              {t("settings.animelib.token.description")}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={login} disabled={waiting || !isOnline || proxyInvalid}>
                {waiting ? t("settings.animelib.login.waiting") : t("settings.animelib.login")}
              </Button>
              <span className="text-hint text-xs">{t("settings.animelib.login.hint")}</span>
            </div>
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
              <Button
                className="h-6 px-2 text-xs"
                onClick={clear}
                disabled={account === null || !account.tokenSaved}
              >
                {t("settings.animelib.token.clear")}
              </Button>
              <span className="windows95-text text-hint text-xs">
                {animelibAccountLabel(account, t)}
              </span>
            </div>
            {loginError && (
              <span className="text-destructive text-xs" role="alert">
                {loginError}
              </span>
            )}
            {error && (
              <span className="text-destructive text-xs" role="alert">
                {error}
              </span>
            )}
            {saved && (
              <span className="text-hint text-xs">{t("settings.animelib.token.saved")}</span>
            )}
          </div>

          <ProxyField
            className="col-span-full"
            label={t("settings.animelib.proxy.url")}
            value={proxyUrl}
            onChange={(next) => patchSettings({ animelibProxyUrl: next })}
            test={() => streamApi.testConnection()}
            testOkLabel={t("settings.animelib.proxy.test.ok")}
            testFailLabel={t("settings.animelib.proxy.test.fail")}
            testDisabled={!isOnline}
          />
        </div>
      </div>
    </section>
  );
}
