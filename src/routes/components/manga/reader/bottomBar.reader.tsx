import { useCell } from "@hullperse/hp_utils/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { RefObject } from "react";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { settingsAtoms } from "@/store/settings.store";
import { PageIndicator } from "@/routes/components/manga/reader/pageIndicator.reader";
import { readerButton } from "@/routes/components/manga/reader/chrome.reader";

export function ReaderBottomBar({
  page,
  counter,
  count,
  shown,
  onHoverStart,
  onHoverEnd,
  pagePicker,
  openPagePicker,
  pageButton,
  onJump,
  paged,
  onStep,
  rtl,
}: {
  page: number;
  counter: string | number;
  count: number;
  shown: boolean;
  onHoverStart: () => void;
  onHoverEnd: () => void;
  pagePicker: boolean;
  openPagePicker: (open: boolean) => void;
  pageButton: RefObject<HTMLButtonElement | null>;
  onJump: (page: number) => void;
  paged: boolean;
  onStep: (delta: number) => void;
  rtl: boolean;
}) {
  const { t } = useI18n();
  const turnByButtons = useCell(settingsAtoms.mangaReaderTurn) === "buttons";
  const showTurnButtons = turnByButtons && paged;
  const leftEnabled = rtl ? page < count - 1 : page > 0;
  const rightEnabled = rtl ? page > 0 : page < count - 1;

  return (
    <div
      data-no-wheel
      className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-2 pb-2"
    >
      <div
        data-reader-bottom-bar
        aria-hidden={!shown}
        inert={!shown}
        onPointerEnter={onHoverStart}
        onPointerLeave={onHoverEnd}
        className={`flex items-center gap-1.5 transition-opacity duration-200 ${
          shown ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        {showTurnButtons && (
          <Button
            variant="ghost"
            className={readerButton}
            disabled={!leftEnabled}
            onClick={() => onStep(rtl ? 1 : -1)}
            aria-label={t(rtl ? "common.next" : "common.previous")}
          >
            <ChevronLeft aria-hidden />
          </Button>
        )}
        <PageIndicator
          page={page}
          counter={counter}
          count={count}
          open={pagePicker}
          onOpenChange={openPagePicker}
          trigger={pageButton}
          onJump={onJump}
        />
        {showTurnButtons && (
          <Button
            variant="ghost"
            className={readerButton}
            disabled={!rightEnabled}
            onClick={() => onStep(rtl ? -1 : 1)}
            aria-label={t(rtl ? "common.previous" : "common.next")}
          >
            <ChevronRight aria-hidden />
          </Button>
        )}
      </div>
    </div>
  );
}
