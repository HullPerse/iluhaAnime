import type { FatalVariantProps } from "./shared.fatal";

const FONT = '"Perfect DOS VGA 437", monospace';

export function YorhaBsod({
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
      style={{ backgroundColor: "#1f1b18", color: "#ffffff", fontFamily: FONT }}
    >
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center px-6 py-16">
        <p className="yorha-glitch text-xl font-bold tracking-[0.2em]">{texts.yorhaBanner}</p>
        <p className="mt-6 text-xl opacity-80">{texts.kindLabel}</p>
        <p className="mt-4 w-full text-left text-xl leading-relaxed break-words">{info.message}</p>
        <p className="mt-4 w-full text-left text-xl leading-relaxed opacity-80">{texts.hint}</p>
        <div className="mt-8 flex w-full flex-wrap items-center gap-3">
          <button
            ref={reloadRef}
            type="button"
            onClick={onReload}
            className="border-2 border-white bg-transparent px-6 py-1 text-xl font-bold text-white outline-none hover:bg-white hover:text-[#1f1b18] focus-visible:bg-white focus-visible:text-[#1f1b18]"
          >
            {texts.reload}
          </button>
          <button
            type="button"
            onClick={onSafeReload}
            className="border-2 border-white bg-transparent px-6 py-1 text-xl text-white outline-none hover:bg-white hover:text-[#1f1b18] focus-visible:bg-white focus-visible:text-[#1f1b18]"
          >
            {texts.safeReload}
          </button>
          {canRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="border-2 border-white bg-transparent px-6 py-1 text-xl text-white outline-none hover:bg-white hover:text-[#1f1b18] focus-visible:bg-white focus-visible:text-[#1f1b18]"
            >
              {texts.retry}
            </button>
          ) : (
            <span className="text-xl opacity-70">* {texts.retryUsed}</span>
          )}
          <button
            type="button"
            onClick={onCopy}
            className="border-2 border-white bg-transparent px-6 py-1 text-xl text-white outline-none hover:bg-white hover:text-[#1f1b18] focus-visible:bg-white focus-visible:text-[#1f1b18]"
          >
            {copied ? texts.copied : texts.copy}
          </button>
        </div>
        <button
          type="button"
          onClick={onToggleDetails}
          aria-expanded={detailsOpen}
          className="mt-8 w-full bg-transparent text-left text-xl text-white underline outline-none focus-visible:bg-white focus-visible:text-[#1f1b18]"
        >
          {detailsOpen ? "- " : "+ "}
          {texts.details}
        </button>
        {detailsOpen && (
          <pre className="mt-2 max-h-64 w-full overflow-auto border-2 border-white p-3 text-left text-base leading-relaxed break-words whitespace-pre-wrap">
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
