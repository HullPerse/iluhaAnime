import { useCell } from "@hullperse/hp_utils/react";
import { useState } from "react";
import type { readerModes } from "@/config/manga/reader.config";
import { bookPair } from "@/lib/manga/reader.utils";
import { settingsAtoms } from "@/store/settings.store";

export function useReaderLayout(
  mode: (typeof readerModes)[number],
  page: number,
  count: number,
  setPage: (page: number) => void
) {
  const splitWide = useCell(settingsAtoms.mangaSplitWide);
  const [secondHalf, setSecondHalf] = useState<boolean>(false);
  const [widePages, setWidePages] = useState<Record<number, boolean>>({});
  const strip = mode === "strip";
  const pair = mode === "book" ? bookPair(page, count) : undefined;
  const spread = pair !== undefined && widePages[pair] === false && widePages[pair + 1] === false;
  const rtl = mode === "rtl" || mode === "book";
  const halfSide = secondHalf !== rtl ? "right" : "left";
  const half = splitWide && !strip ? halfSide : undefined;
  const split = half !== undefined && widePages[page] === true;
  const end = page === count - 1 && (!split || secondHalf);
  const counter = pair !== undefined && spread ? `${pair + 1}-${pair + 2}` : page + 1;

  return {
    strip,
    pair,
    spread,
    rtl,
    half,
    end,
    counter,
    inspectPage(index: number, wide: boolean) {
      setWidePages((current) =>
        current[index] === wide ? current : { ...current, [index]: wide }
      );
    },
    goToPage(index: number) {
      if (!count) return;
      setSecondHalf(false);
      setPage(Math.max(0, Math.min(Math.trunc(index), count - 1)));
    },
    turnPage(delta: number) {
      if (!count || strip) return;

      if (split && secondHalf !== delta > 0) {
        setSecondHalf(delta > 0);

        return;
      }

      const edge = spread && pair !== undefined ? pair + Number(delta > 0) : page;
      const target = Math.max(0, Math.min(edge + delta, count - 1));

      if (target === page) return;
      setPage(target);
      setSecondHalf(delta < 0);
    },
  } as const;
}
