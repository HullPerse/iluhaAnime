import type { FatalVariantProps } from "./shared.fatal";

const FONT = '"Perfect DOS VGA 437", monospace';

export function TerminalBsod({
  info,
  texts,
  canRetry,
  safe,
  detailsOpen,
  copied,
  reloadRef,
  onToggleDetails,
  onReload,
  onSafeReload,
  onRetry,
  onCopy,
}: FatalVariantProps) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed inset-0 z-[100] overflow-y-auto"
      style={{ backgroundColor: "#0c0c0c", color: "#00ff41", fontFamily: FONT }}
    >
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center px-6 py-16">
        <p className="text-xl font-bold tracking-[0.2em]">Kernel panic - not syncing</p>
        <p className="mt-6 text-xl opacity-80">{texts.kindLabel}</p>
        <p className="mt-4 w-full text-left text-xl leading-relaxed break-words">{info.message}</p>
        <p className="mt-4 w-full text-left text-xl leading-relaxed opacity-80">{texts.hint}</p>
        <div className="mt-8 flex w-full flex-wrap items-center gap-3">
          <button
            ref={reloadRef}
            type="button"
            onClick={onReload}
            className="border-2 bg-transparent px-6 py-1 text-xl font-bold outline-none hover:brightness-150 focus-visible:underline"
            style={{ borderColor: "#00ff41" }}
          >
            {texts.reload}
          </button>
          <button
            type="button"
            onClick={onSafeReload}
            className="border-2 bg-transparent px-6 py-1 text-xl outline-none hover:brightness-150 focus-visible:underline"
            style={{ borderColor: "#00ff41" }}
          >
            {texts.safeReload}
          </button>
          {canRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="border-2 bg-transparent px-6 py-1 text-xl outline-none hover:brightness-150 focus-visible:underline"
              style={{ borderColor: "#00ff41" }}
            >
              {texts.retry}
            </button>
          ) : (
            <span className="text-xl opacity-70">* {texts.retryUsed}</span>
          )}
          <button
            type="button"
            onClick={onCopy}
            className="border-2 bg-transparent px-6 py-1 text-xl outline-none hover:brightness-150 focus-visible:underline"
            style={{ borderColor: "#00ff41" }}
          >
            {copied ? texts.copied : texts.copy}
          </button>
        </div>
        <button
          type="button"
          onClick={onToggleDetails}
          aria-expanded={detailsOpen}
          className="mt-8 w-full bg-transparent text-left text-xl underline outline-none focus-visible:underline"
        >
          {detailsOpen ? "- " : "+ "}
          {texts.details}
        </button>
        {detailsOpen && (
          <pre
            className="mt-2 max-h-64 w-full overflow-auto border-2 p-3 text-left text-base leading-relaxed break-words whitespace-pre-wrap"
            style={{ borderColor: "#00ff41" }}
          >
            {`scope=${info.scope} route=${info.route} theme=${info.themeName}`}
            {"\n"}
            {info.stack ?? info.message}
          </pre>
        )}
        {safe && <p className="mt-8 text-center text-xl">* {texts.safeNote}</p>}
      </div>
    </div>
  );
}
