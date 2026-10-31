import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useEffect, useRef, useState } from "react";

import { resolveFatalVariant } from "@/config/settings/screens.config";
import { resolveDbTexts, resolveFatalLocale } from "@/lib/core/fatalTexts.utils";
import { attempt } from "@/lib/core/attempt.utils";
import type { FatalVariant } from "@/types/core/fatal";
import type { DbScreenProps } from "@/types/core/screen.db";

const WRAP: Record<FatalVariant, { backgroundColor: string; color: string; fontFamily: string }> = {
  win95: {
    backgroundColor: "#0000aa",
    color: "#ffffff",
    fontFamily: '"Perfect DOS VGA 437", monospace',
  },
  xp: { backgroundColor: "#003399", color: "#ffffff", fontFamily: "Tahoma, sans-serif" },
  win7: { backgroundColor: "#1b5aa6", color: "#ffffff", fontFamily: '"Segoe UI", sans-serif' },
  yorha: {
    backgroundColor: "#1f1b18",
    color: "#ffffff",
    fontFamily: '"Perfect DOS VGA 437", monospace',
  },
  terminal: {
    backgroundColor: "#0c0c0c",
    color: "#00ff41",
    fontFamily: '"Perfect DOS VGA 437", monospace',
  },
  retroism: {
    backgroundColor: "#000000",
    color: "#d8d8d8",
    fontFamily: '"Perfect DOS VGA 437", monospace',
  },
  generic: {
    backgroundColor: "var(--color-background, #222222)",
    color: "var(--color-text, #000000)",
    fontFamily: "inherit",
  },
};

export function DbScreen({
  error,
  themeName,
  safe = false,
  dataDir,
  onRetry,
  onReload,
  onOpenFolder,
}: DbScreenProps) {
  const [detailsOpen, setDetailsOpen] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const retryRef = useRef<HTMLButtonElement | null>(null);
  const texts = resolveDbTexts(resolveFatalLocale());

  useEffect(() => {
    retryRef.current?.focus();
  }, []);

  const copyDetails = (): void => {
    (async () => {
      const [, pluginError] = await attempt(writeText(`[database] ${error}`));
      if (pluginError === null) {
        setCopied(true);
        return;
      }
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        const [, nativeError] = await attempt(navigator.clipboard.writeText(error));
        if (nativeError === null) setCopied(true);
      }
    })();
  };

  const wrap = WRAP[resolveFatalVariant(themeName, safe)];

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed inset-0 z-[100] overflow-x-clip overflow-y-auto"
      style={wrap}
    >
      <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col justify-center px-6 py-14">
        <p className="text-2xl font-bold">{texts.title}</p>
        <p className="mt-4 text-lg leading-relaxed break-words">{error}</p>
        <p className="mt-2 text-lg leading-relaxed opacity-80">{texts.hint}</p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <button
            ref={retryRef}
            type="button"
            onClick={onRetry}
            className="border-2 border-current bg-transparent px-6 py-1 text-lg font-bold outline-none hover:brightness-125 focus-visible:underline"
          >
            {texts.retry}
          </button>
          <button
            type="button"
            onClick={onReload}
            className="border border-current bg-transparent px-6 py-1 text-lg outline-none hover:brightness-125 focus-visible:underline"
          >
            {texts.reload}
          </button>
          {dataDir && (
            <button
              type="button"
              onClick={onOpenFolder}
              className="border border-current bg-transparent px-6 py-1 text-lg outline-none hover:brightness-125 focus-visible:underline"
            >
              {texts.openFolder}
            </button>
          )}
          <button
            type="button"
            onClick={copyDetails}
            className="border border-current bg-transparent px-6 py-1 text-lg outline-none hover:brightness-125 focus-visible:underline"
          >
            {copied ? texts.copied : texts.copy}
          </button>
        </div>
        <button
          type="button"
          onClick={() => setDetailsOpen((open) => !open)}
          aria-expanded={detailsOpen}
          className="mt-8 bg-transparent text-left text-lg underline outline-none focus-visible:underline"
        >
          {texts.details}
        </button>
        {detailsOpen && (
          <pre className="mt-2 max-h-64 overflow-auto border border-current p-3 text-left text-sm leading-relaxed break-words whitespace-pre-wrap opacity-90">
            {`scope=database theme=${themeName}`}
            {"\n"}
            {error}
          </pre>
        )}
      </div>
    </div>
  );
}
