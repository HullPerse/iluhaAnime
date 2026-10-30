import type { FatalVariantProps } from "@/types/core/shared.fatal";

export function XpBsod({
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
      style={{ backgroundColor: "#003399", color: "#ffffff", fontFamily: "Tahoma, sans-serif" }}
    >
      <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col px-6 py-14">
        <p className="text-2xl font-bold">{texts.kindLabel}</p>
        <p className="mt-6 text-lg leading-relaxed break-words">{info.message}</p>
        <p className="mt-4 text-lg leading-relaxed opacity-90">{texts.hint}</p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <button
            ref={reloadRef}
            type="button"
            onClick={onReload}
            className="bg-white px-8 py-1.5 text-lg font-bold text-[#003399] outline-none hover:brightness-110 focus-visible:underline"
          >
            {texts.reload}
          </button>
          <button
            type="button"
            onClick={onSafeReload}
            className="border border-white bg-transparent px-8 py-1.5 text-lg text-white outline-none hover:bg-white/20 focus-visible:underline"
          >
            {texts.safeReload}
          </button>
          {canRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="border border-white bg-transparent px-8 py-1.5 text-lg text-white outline-none hover:bg-white/20 focus-visible:underline"
            >
              {texts.retry}
            </button>
          ) : (
            <span className="text-lg opacity-70">{texts.retryUsed}</span>
          )}
          <button
            type="button"
            onClick={onCopy}
            className="border border-white bg-transparent px-8 py-1.5 text-lg text-white outline-none hover:bg-white/20 focus-visible:underline"
          >
            {copied ? texts.copied : texts.copy}
          </button>
        </div>
        <button
          type="button"
          onClick={onToggleDetails}
          aria-expanded={detailsOpen}
          className="mt-8 bg-transparent text-left text-lg text-white underline outline-none focus-visible:bg-white focus-visible:text-[#003399]"
        >
          {texts.details}
        </button>
        {detailsOpen && (
          <pre className="mt-2 max-h-64 overflow-auto border border-white/60 bg-black/30 p-3 text-left text-sm leading-relaxed break-words whitespace-pre-wrap">
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
