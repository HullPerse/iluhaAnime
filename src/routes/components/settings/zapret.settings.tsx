import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button.component";
import {
  ZAPRET_ALL_IPS,
  ZAPRET_HOSTLIST,
  ZAPRET_SAFE_IPS,
  zapretLocalEndpoint,
} from "@/config/settings/zapret.config";
import { useI18n } from "@/hooks/i18n.hook";
import { showError } from "@/lib/core/ui/notification.utils";
import { ignore } from "@/lib/core/shared/promise.utils";
import { attempt } from "@hullperse/hp_utils/attempt";
import { useCell } from "@hullperse/hp_utils/react";
import { settingsAtoms } from "@/store/settings.store";

const COPIED_MS = 1500;

function CopyButton({ value }: { value: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState<boolean>(false);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    []
  );

  const copy = async () => {
    const [, error] = await attempt(writeText(value));
    if (error !== null) {
      showError(t("settings.zapret.copy.error"), error.message);
      return;
    }
    setCopied(true);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setCopied(false), COPIED_MS);
  };

  return (
    <Button
      className="h-6 px-2 text-xs"
      onClick={() => {
        ignore(copy());
      }}
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      {copied ? t("settings.zapret.copied") : t("settings.zapret.copy")}
    </Button>
  );
}

function CopyList({
  title,
  value,
  sectionId,
}: {
  title: string;
  value: string;
  sectionId: string;
}) {
  const { t } = useI18n();
  const lines = value.split("\n").length;

  return (
    <section className="ui-panel" data-find-section={sectionId}>
      <div className="ui-titlebar group flex items-center justify-between gap-1">
        <span className="text-title-text font-bold">{title}</span>
      </div>
      <div className="flex flex-col gap-2 p-2">
        <div className="flex flex-wrap items-center gap-2">
          <CopyButton value={value} />
          <span className="text-hint windows95-text text-xs">
            {t("settings.zapret.lines", { count: lines })}
          </span>
        </div>
        <pre className="bg-field windows95-border max-h-52 overflow-auto p-2 font-mono text-xs leading-4 break-all whitespace-pre-wrap select-all">
          {value}
        </pre>
      </div>
    </section>
  );
}

function LocalEndpoint() {
  const { t } = useI18n();
  const port = useCell(settingsAtoms.httpApiPort);
  const value = zapretLocalEndpoint(port);

  return (
    <section className="ui-panel" data-find-section="zapret.local">
      <div className="ui-titlebar group flex items-center justify-between gap-1">
        <span className="text-title-text font-bold">{t("settings.zapret.local.title")}</span>
      </div>
      <div className="flex flex-col gap-2 p-2">
        <div className="flex flex-wrap items-center gap-2">
          <code className="bg-field windows95-border px-2 py-1 font-mono text-xs">{value}</code>
          <CopyButton value={value} />
        </div>
      </div>
    </section>
  );
}

export default function SettingsZapret() {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-3">
      <CopyList
        sectionId="zapret.hostlist"
        title={t("settings.zapret.hostlist.title")}
        value={ZAPRET_HOSTLIST.join("\n")}
      />

      <CopyList
        sectionId="zapret.safe"
        title={t("settings.zapret.safe.title")}
        value={ZAPRET_SAFE_IPS.join("\n")}
      />

      <CopyList
        sectionId="zapret.all"
        title={t("settings.zapret.all.title")}
        value={ZAPRET_ALL_IPS.join("\n")}
      />

      <LocalEndpoint />
    </div>
  );
}
