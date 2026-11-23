import { ChevronUp } from "lucide-react";
import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { useDismissOnOutside } from "@/hooks/manga/reader/dismiss.hook";
import { readerButton } from "@/routes/components/manga/reader/chrome.reader";

export function PageIndicator({
  page,
  counter,
  count,
  open,
  onOpenChange,
  trigger,
  onJump,
}: {
  page: number;
  counter: string | number;
  count: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: RefObject<HTMLButtonElement | null>;
  onJump: (page: number) => void;
}) {
  const { t } = useI18n();
  const root = useRef<HTMLDivElement>(null);
  const current = useRef<HTMLButtonElement>(null);
  useDismissOnOutside(open, root, () => onOpenChange(false));
  useEffect(() => {
    if (open) current.current?.scrollIntoView({ block: "center" });
  }, [open]);
  const percent = count > 0 ? Math.min(100, ((page + 1) / count) * 100) : 0;

  return (
    <div
      ref={root}
      className="pointer-events-auto relative"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        onOpenChange(false);
        trigger.current?.focus();
      }}
    >
      {open && (
        <div
          data-reader-ui
          className="ui-panel text-text absolute bottom-full left-1/2 z-20 mb-2 flex w-64 -translate-x-1/2 flex-col text-xs"
        >
          <div className="ui-titlebar justify-between gap-1">
            <span className="truncate">{t("manga.reader.goToPage")}</span>
            <span className="shrink-0 font-normal tabular-nums opacity-80">
              {counter} / {count}
            </span>
          </div>
          <div
            role="group"
            aria-label={t("manga.reader.goToPage")}
            className="grid max-h-[min(24rem,60vh)] grid-cols-6 gap-1 overflow-y-auto p-1.5"
          >
            {Array.from({ length: count }, (_, index) => index).map((index) => (
              <Button
                key={index}
                ref={index === page ? current : undefined}
                autoFocus={index === page}
                variant={index === page ? "outline" : "default"}
                aria-current={index === page ? "true" : undefined}
                aria-label={t("manga.search.page", { page: index + 1 })}
                className="min-h-6 justify-center px-0 tabular-nums"
                onClick={() => {
                  onOpenChange(false);
                  trigger.current?.focus();

                  if (index !== page) onJump(index);
                }}
              >
                {index + 1}
              </Button>
            ))}
          </div>
        </div>
      )}
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-label={t("manga.reader.goToPage")}
        title={t("manga.reader.goToPage")}
        className={`${readerButton} group relative flex min-h-7 min-w-24 cursor-pointer items-center justify-center gap-1 overflow-hidden px-2 text-xs tabular-nums hover:border-white/60`}
        onClick={() => onOpenChange(!open)}
      >
        <span>
          {counter} / {count}
        </span>
        <ChevronUp aria-hidden className="size-3 opacity-60 group-hover:opacity-100" />
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 bg-white/20">
          <span className="block h-full bg-white/80" style={{ width: `${percent}%` }} />
        </span>
      </button>
    </div>
  );
}
