import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { check } from "@tauri-apps/plugin-updater";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { resolveFatalVariant } from "@/config/settings/screens.config";
import { resolveFatalLocale, resolveFatalTexts } from "@/lib/core/fatal/fatalTexts.utils";
import { attempt } from "@hullperse/hp_utils/attempt";
import { useHotkeys } from "@/hooks/hotkeys.hook";

import { GenericBsod } from "@/components/shared/fatal/generic.fatal";
import { RetroismBsod } from "@/components/shared/fatal/retroism.fatal";
import { formatFatalCopy } from "@/lib/core/fatal/fatalCopy.utils";
import { TerminalBsod } from "@/components/shared/fatal/terminal.fatal";
import { Win7Bsod } from "@/components/shared/fatal/win7.fatal";
import { Win95Bsod } from "@/components/shared/fatal/win95.fatal";
import { XpBsod } from "@/components/shared/fatal/xp.fatal";
import { YorhaBsod } from "@/components/shared/fatal/yorha.fatal";
import type { FatalVariant } from "@/types/core/fatal";
import type { FatalScreenProps } from "@/types/core/screen.fatal";
import type { FatalUpdateState, FatalVariantProps } from "@/types/core/shared.fatal";

const BSOD_VARIANTS: Record<FatalVariant, (props: FatalVariantProps) => ReactNode> = {
  generic: GenericBsod,
  retroism: RetroismBsod,
  terminal: TerminalBsod,
  win7: Win7Bsod,
  win95: Win95Bsod,
  xp: XpBsod,
  yorha: YorhaBsod,
};

export function FatalScreen({
  info,
  safe = false,
  onReload,
  onSafeReload,
  onRetry,
}: FatalScreenProps) {
  const [detailsOpen, setDetailsOpen] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [updateState, setUpdateState] = useState<FatalUpdateState>("idle");
  const [updateError, setUpdateError] = useState<string | null>(null);
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

  const checkForUpdate = (): void => {
    if (updateState === "checking" || updateState === "installing") return;
    setUpdateError(null);
    setUpdateState("checking");
    (async () => {
      const [update, checkError] = await attempt(check());
      if (checkError !== null) {
        setUpdateError(checkError.message);
        setUpdateState("error");
        return;
      }
      if (!update) {
        setUpdateState("latest");
        return;
      }
      setUpdateState("installing");
      const [, installError] = await attempt(update.downloadAndInstall());
      if (installError !== null) {
        setUpdateError(installError.message);
        setUpdateState("error");
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
    onCheckUpdate: checkForUpdate,
    updateState,
    updateError,
  };

  const Bsod = BSOD_VARIANTS[variant];
  return <Bsod {...shared} />;
}
