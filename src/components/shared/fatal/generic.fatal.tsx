import type { FatalVariantProps } from "./shared.fatal";

export function GenericBsod({
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
      className="bg-background text-text fixed inset-0 z-[100] overflow-x-clip overflow-y-auto"
    >
      <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col justify-center px-6 py-14">
        <div className="bg-surface windows95-active-border p-6">
          <p className="text-destructive text-xl font-bold">{texts.kindLabel}</p>
          <p className="mt-3 text-base leading-relaxed break-words">{info.message}</p>
          <p className="text-muted mt-2 text-sm leading-relaxed">{texts.hint}</p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button
              ref={reloadRef}
              type="button"
              onClick={onReload}
              className="bg-primary text-text windows95-active-border windows95-text px-6 py-1 text-base outline-none hover:brightness-110 focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-dotted"
            >
              {texts.reload}
            </button>
            <button
              type="button"
              onClick={onSafeReload}
              className="bg-primary text-text windows95-active-border windows95-text px-6 py-1 text-base outline-none hover:brightness-110 focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-dotted"
            >
              {texts.safeReload}
            </button>
            {canRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="bg-primary text-text windows95-active-border windows95-text px-6 py-1 text-base outline-none hover:brightness-110 focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-dotted"
              >
                {texts.retry}
              </button>
            ) : (
              <span className="text-muted text-sm">{texts.retryUsed}</span>
            )}
            <button
              type="button"
              onClick={onCopy}
              className="bg-primary text-text windows95-active-border windows95-text px-6 py-1 text-base outline-none hover:brightness-110 focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-dotted"
            >
              {copied ? texts.copied : texts.copy}
            </button>
          </div>
          <button
            type="button"
            onClick={onToggleDetails}
            aria-expanded={detailsOpen}
            className="text-highlight mt-4 bg-transparent text-left text-sm underline outline-none focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-dotted"
          >
            {texts.details}
          </button>
          {detailsOpen && (
            <pre className="bg-field windows95-active-border mt-2 max-h-64 overflow-auto p-3 text-left text-xs leading-relaxed break-words whitespace-pre-wrap">
              {`scope=${info.scope} route=${info.route} theme=${info.themeName}`}
              {"\n"}
              {info.stack ?? info.message}
            </pre>
          )}
          {safe && <p className="text-muted mt-3 text-sm">{texts.safeNote}</p>}
        </div>
      </div>
    </div>
  );
}
