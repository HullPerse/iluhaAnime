import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useEffect, useRef, useState } from "react";

import { resolveFatalVariant } from "@/config/fatal/screens.config";
import { translate } from "@/lib/locale/i18n.utils";
import { attempt, attemptSync } from "@/lib/utils/attempt.utils";
import type { FatalInfo, FatalTexts } from "@/types/fatal";
import type { Locale, TranslationKey } from "@/types/i18n";

import { GenericBsod } from "./generic.fatal";
import { formatFatalCopy } from "./shared.fatal";
import { Win7Bsod } from "./win7.fatal";
import { Win95Bsod } from "./win95.fatal";
import { XpBsod } from "./xp.fatal";

export interface FatalScreenProps {
  info: FatalInfo;
  safe?: boolean;
  onReload: () => void;
  onSafeReload: () => void;
  onRetry: () => void;
}

export function resolveFatalLocale(): Locale {
  if (typeof localStorage === "undefined") return "en";
  const [raw, readError] = attemptSync(() => localStorage.getItem("iluha.v1.settings"));
  if (readError !== null || !raw) return "en";
  const [parsed, parseError] = attemptSync(() => JSON.parse(raw) as unknown);
  if (parseError !== null || typeof parsed !== "object" || parsed === null) return "en";
  const envelope = parsed as { data?: unknown };
  const data = envelope.data;
  if (typeof data !== "object" || data === null) return "en";
  const language = (data as { language?: unknown }).language;
  return language === "ru" ? "ru" : "en";
}

export function resolveFatalTexts(locale: Locale, kind: FatalInfo["kind"]): FatalTexts {
  const pick = (key: TranslationKey): string => translate(locale, key);
  return {
    kindLabel: pick(`fatal.kind.${kind}` as TranslationKey),
    hint: pick("fatal.hint"),
    details: pick("fatal.details"),
    copy: pick("fatal.copy"),
    copied: pick("fatal.copied"),
    reload: pick("fatal.reload"),
    safeReload: pick("fatal.safeReload"),
    retry: pick("fatal.retry"),
    retryUsed: pick("fatal.retryUsed"),
    safeNote: pick("fatal.safeNote"),
  };
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
  return <GenericBsod {...shared} />;
}
