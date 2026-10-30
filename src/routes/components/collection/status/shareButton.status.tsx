import { Check, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { attempt } from "@/lib/core/attempt.utils";
import { Debouncer } from "@/lib/core/debounce.utils";

export function ShareStatusButton({ onShare }: { onShare: () => Promise<void> | void }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState<boolean>(false);
  const copyHideRef = useRef<Debouncer<[]> | null>(null);
  useEffect(() => () => copyHideRef.current?.cancel(), []);

  return (
    <Button
      size="icon"
      className="size-6 shrink-0"
      title={t("collection.share.copy")}
      aria-label={t("collection.share.copy")}
      onClick={() => {
        const result = onShare();
        if (result === undefined) return;
        (async () => {
          const [, error] = await attempt(result);
          if (error) return;
          setCopied(true);
          if (copyHideRef.current === null) {
            copyHideRef.current = new Debouncer(() => setCopied(false), { wait: 1500 });
          }
          copyHideRef.current.maybeExecute();
        })();
      }}
    >
      {copied ? <Check className="size-3.5" /> : <Share2 className="size-3.5" />}
    </Button>
  );
}
