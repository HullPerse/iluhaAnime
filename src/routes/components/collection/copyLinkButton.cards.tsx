import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Debouncer } from "@hullperse/hp_utils/debounce";
import { attempt } from "@hullperse/hp_utils/attempt";
import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";

export default function CopyLinkButton({
  value,
  disabled = false,
  className = "size-6 shrink-0",
  onCopied,
  onError,
}: {
  value: string;
  disabled?: boolean;
  className?: string;
  onCopied?: () => void;
  onError?: () => void;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState<boolean>(false);
  const hideRef = useRef<Debouncer<[]> | null>(null);

  useEffect(() => () => hideRef.current?.cancel(), []);

  const copy = async () => {
    const [, error] = await attempt(writeText(value));

    if (error !== null) {
      hideRef.current?.cancel();
      setCopied(false);
      onError?.();

      return;
    }

    setCopied(true);
    onCopied?.();

    if (hideRef.current === null) {
      hideRef.current = new Debouncer(() => setCopied(false), { wait: 2000 });
    }

    hideRef.current.maybeExecute();
  };

  const label = copied ? t("collection.gift.copied") : t("collection.gift.copy");

  return (
    <Button
      size="icon"
      variant="outline"
      className={className}
      disabled={disabled}
      aria-label={label}
      title={label}
      onClick={copy}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </Button>
  );
}
