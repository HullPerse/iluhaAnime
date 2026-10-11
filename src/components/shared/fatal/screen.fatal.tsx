import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useEffect, useRef, useState } from "react";

import { resolveFatalVariant } from "@/config/fatal/screens.config";
import { resolveFatalLocale, resolveFatalTexts } from "@/lib/fatal/texts.utils";
import { attempt } from "@/lib/utils/attempt.utils";
import type { FatalInfo } from "@/types/fatal";

import { GenericBsod } from "./generic.fatal";
import { formatFatalCopy } from "./shared.fatal";
import { Win7Bsod } from "./win7.fatal";
import { Win95Bsod } from "./win95.fatal";
import { XpBsod } from "./xp.fatal";
import { YorhaBsod } from "./yorha.fatal";

export interface FatalScreenProps {
  info: FatalInfo;
  safe?: boolean;
  onReload: () => void;
  onSafeReload: () => void;
  onRetry: () => void;
}

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

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && info.retryCount < 1) onRetry();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [info.retryCount, onRetry]);

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
  return <GenericBsod {...shared} />;
}
