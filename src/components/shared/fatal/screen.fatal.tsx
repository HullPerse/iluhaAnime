import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useEffect, useRef, useState } from "react";

import { resolveFatalVariant } from "@/config/settings/screens.config";
import { resolveFatalLocale, resolveFatalTexts } from "@/lib/core/fatalTexts.utils";
import { attempt } from "@/lib/core/attempt.utils";
import { useHotkeys } from "@/hooks/hotkeys.hook";

import { GenericBsod } from "@/components/shared/fatal/generic.fatal";
import { RetroismBsod } from "@/components/shared/fatal/retroism.fatal";
import { formatFatalCopy } from "@/components/shared/fatal/shared.fatal";
import { TerminalBsod } from "@/components/shared/fatal/terminal.fatal";
import { Win7Bsod } from "@/components/shared/fatal/win7.fatal";
import { Win95Bsod } from "@/components/shared/fatal/win95.fatal";
import { XpBsod } from "@/components/shared/fatal/xp.fatal";
import { YorhaBsod } from "@/components/shared/fatal/yorha.fatal";
import type { FatalScreenProps } from "@/types/core/screen.fatal";

export function FatalScreen({
  info,
  safe = false,
  onReload,
  onSafeReload,
  onRetry,
}: FatalScreenProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const reloadRef = useRef<HTMLButtonElement | null>(null);
  const canRetry = info.retryCount < 1;
  const variant = resolveFatalVariant(info.themeName, safe);
  const texts = resolveFatalTexts(resolveFatalLocale(), info.kind);

  useEffect(() => {
    reloadRef.current?.focus();
  }, []);

  useHotkeys([{ id: "retry", chord: "Escape", repeat: "once" }], {
    onAction: () => {
      if (info.retryCount < 1) onRetry();
    },
  });

  const copyDetails = (): void => {
    (async () => {
      const text = formatFatalCopy(info);
      const [, pluginError] = await attempt(writeText(text));
      if (pluginError === null) {
        setCopied(true);
        return;
      }
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        const [, nativeError] = await attempt(navigator.clipboard.writeText(text));
        if (nativeError === null) setCopied(true);
      }
    })();
  };

  const shared = {
    info,
    texts,
    canRetry,
    safe,
    detailsOpen,
    copied,
    reloadRef,
    onToggleDetails: () => setDetailsOpen((open) => !open),
    onReload,
    onSafeReload,
    onRetry,
    onCopy: copyDetails,
  };

  if (variant === "win95") return <Win95Bsod {...shared} />;
  if (variant === "xp") return <XpBsod {...shared} />;
  if (variant === "win7") return <Win7Bsod {...shared} />;
  if (variant === "yorha") return <YorhaBsod {...shared} />;
  if (variant === "terminal") return <TerminalBsod {...shared} />;
  if (variant === "retroism") return <RetroismBsod {...shared} />;
  return <GenericBsod {...shared} />;
}
