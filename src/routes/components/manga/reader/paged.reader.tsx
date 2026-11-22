import { useCell } from "@hullperse/hp_utils/react";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button.component";
import type { readerModes } from "@/config/manga/reader.config";
import { useI18n } from "@/hooks/i18n.hook";
import { ReaderPage } from "@/routes/components/manga/reader/page.reader";
import { settingsAtoms } from "@/store/settings.store";

export function PagedReader({
  mode,
  page,
  manifest,
  pair,
  spread,
  half,
  inspect,
  step,
  onLoad,
  onOffset,
}: {
  mode: (typeof readerModes)[number];
  page: number;
  manifest: string;
  pair: number | undefined;
  spread: boolean;
  half: "left" | "right" | undefined;
  inspect: (page: number, wide: boolean) => void;
  step: (delta: number) => void;
  onLoad: (page: number) => void;
  onOffset: (offset: number) => void;
}) {
  const { t } = useI18n();
  const zoom = useCell(settingsAtoms.mangaReaderZoom);
  const containerWidth = useCell(settingsAtoms.mangaReaderWidth);
  const turn = useCell(settingsAtoms.mangaReaderTurn);
  const scroll = useRef<HTMLDivElement>(null);
  const lastPage = useRef<number>(page);
  const pageWidth = Math.min(200, (containerWidth * zoom) / 100);
  const rtl = mode === "rtl" || mode === "book";
  const pages = pair === undefined ? [page] : [pair + 1, pair];
  useEffect(() => {
    if (lastPage.current === page) return;
    lastPage.current = page;
    scroll.current?.scrollTo({ top: 0 });
  }, [page]);

  return (
    <div className="absolute inset-0">
      <div
        ref={scroll}
        data-reader-scroll
        className="h-full w-full overflow-auto"
        onScroll={(event) => onOffset(event.currentTarget.scrollTop)}
      >
        <div className="flex min-h-full w-full flex-col">
          <div
            className="mx-auto my-auto flex items-start justify-center"
            style={{ width: `${pageWidth}%` }}
          >
            {pages.map((index) => (
              <div
                key={index}
                className={
                  spread
                    ? "w-1/2 min-w-0 shrink-0"
                    : index === page
                      ? "w-full min-w-0"
                      : "pointer-events-none hidden"
                }
                aria-hidden={!spread && index !== page}
                inert={!spread && index !== page}
              >
                <ReaderPage
                  manifest={manifest}
                  page={index}
                  strip={false}
                  half={half}
                  inspect={inspect}
                  onLoad={onLoad}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
      {turn === "edges" && (
        <>
          <Button
            className={
              mode === "vertical"
                ? "absolute top-0 left-0 h-1/4 w-full opacity-0 focus-visible:opacity-100"
                : "absolute top-0 left-0 h-full w-1/4 opacity-0 focus-visible:opacity-100"
            }
            onClick={() => step(rtl ? 1 : -1)}
            aria-label={t(rtl ? "common.next" : "common.previous")}
          />
          <Button
            className={
              mode === "vertical"
                ? "absolute bottom-0 left-0 h-1/4 w-full opacity-0 focus-visible:opacity-100"
                : "absolute top-0 right-0 h-full w-1/4 opacity-0 focus-visible:opacity-100"
            }
            onClick={() => step(rtl ? -1 : 1)}
            aria-label={t(rtl ? "common.previous" : "common.next")}
          />
        </>
      )}
    </div>
  );
}
