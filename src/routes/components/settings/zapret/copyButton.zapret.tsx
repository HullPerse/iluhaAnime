import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { showError } from "@/lib/core/ui/notification.utils";
import { ignore } from "@/lib/core/shared/promise.utils";
import { attempt } from "@hullperse/hp_utils/attempt";

export function CopyButton({ value }: { value: string }) {
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

const COPIED_MS = 1500;
