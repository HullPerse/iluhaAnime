import type { FatalVariantProps } from "./shared.fatal";

const FONT = '"Perfect DOS VGA 437", monospace';

export function Win95Bsod({
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
      style={{ backgroundColor: "#0000aa", color: "#ffffff", fontFamily: FONT }}
    >
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col items-center px-6 py-16">
        <p
          className="px-4 py-0.5 text-2xl font-bold tracking-wide"
          style={{ backgroundColor: "#aaaaaa", color: "#0000aa" }}
        >
          {texts.kindLabel}
        </p>
        <p className="mt-10 w-full text-left text-xl leading-relaxed break-words">{info.message}</p>
        <p className="mt-6 w-full text-left text-xl leading-relaxed">{texts.hint}</p>
        <div className="mt-8 flex w-full flex-wrap items-center gap-4">
          <button
            ref={reloadRef}
            type="button"
            onClick={onReload}
            className="border-2 border-white bg-transparent px-6 py-1 text-xl font-bold text-white outline-none hover:bg-white hover:text-[#0000aa] focus-visible:bg-white focus-visible:text-[#0000aa]"
          >
            {texts.reload}
          </button>
          <button
            type="button"
            onClick={onSafeReload}
            className="border-2 border-white bg-transparent px-6 py-1 text-xl text-white outline-none hover:bg-white hover:text-[#0000aa] focus-visible:bg-white focus-visible:text-[#0000aa]"
          >
            {texts.safeReload}
          </button>
          {canRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="border-2 border-white bg-transparent px-6 py-1 text-xl text-white outline-none hover:bg-white hover:text-[#0000aa] focus-visible:bg-white focus-visible:text-[#0000aa]"
            >
              {texts.retry}
            </button>
          ) : (
            <span className="text-xl opacity-70">* {texts.retryUsed}</span>
          )}
          <button
            type="button"
            onClick={onCopy}
            className="border-2 border-white bg-transparent px-6 py-1 text-xl text-white outline-none hover:bg-white hover:text-[#0000aa] focus-visible:bg-white focus-visible:text-[#0000aa]"
          >
            {copied ? texts.copied : texts.copy}
          </button>
        </div>
        <button
          type="button"
          onClick={onToggleDetails}
          aria-expanded={detailsOpen}
          className="mt-8 w-full bg-transparent text-left text-xl text-white underline outline-none focus-visible:bg-white focus-visible:text-[#0000aa]"
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
