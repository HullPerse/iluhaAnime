import type { FatalVariantProps } from "@/types/core/shared.fatal";

export function Win7Bsod({
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
      className="fixed inset-0 z-[100] overflow-x-clip overflow-y-auto"
      style={{ backgroundColor: "#1b5aa6", color: "#ffffff", fontFamily: '"Segoe UI", sans-serif' }}
    >
      <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col justify-center px-8 py-14">
        <p className="text-4xl font-light">:(</p>
        <p className="mt-4 text-2xl font-semibold">{texts.kindLabel}</p>
        <p className="mt-4 text-lg leading-relaxed break-words opacity-95">{info.message}</p>
        <p className="mt-2 text-lg leading-relaxed opacity-80">{texts.hint}</p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <button
            ref={reloadRef}
            type="button"
            onClick={onReload}
            className="bg-white px-10 py-2 text-lg font-semibold text-[#1b5aa6] outline-none hover:brightness-105 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#1b5aa6]"
          >
            {texts.reload}
          </button>
          <button
            type="button"
            onClick={onSafeReload}
            className="border border-white/70 bg-transparent px-10 py-2 text-lg text-white outline-none hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white"
          >
            {texts.safeReload}
          </button>
          {canRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="border border-white/70 bg-transparent px-10 py-2 text-lg text-white outline-none hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white"
            >
              {texts.retry}
            </button>
          ) : (
            <span className="text-lg opacity-70">{texts.retryUsed}</span>
          )}
          <button
            type="button"
            onClick={onCopy}
            className="border border-white/70 bg-transparent px-10 py-2 text-lg text-white outline-none hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white"
          >
            {copied ? texts.copied : texts.copy}
          </button>
        </div>
        <button
          type="button"
          onClick={onToggleDetails}
          aria-expanded={detailsOpen}
          className="mt-8 bg-transparent text-left text-lg text-white underline outline-none focus-visible:bg-white focus-visible:text-[#1b5aa6]"
        >
          {texts.details}
        </button>
        {detailsOpen && (
          <pre className="mt-2 max-h-64 overflow-auto bg-white/10 p-3 text-left text-sm leading-relaxed break-words whitespace-pre-wrap">
            {`scope=${info.scope} route=${info.route} theme=${info.themeName}`}
            {"\n"}
            {info.stack ?? info.message}
          </pre>
        )}
        {safe && <p className="mt-6 text-lg opacity-80">{texts.safeNote}</p>}
      </div>
    </div>
  );
}
