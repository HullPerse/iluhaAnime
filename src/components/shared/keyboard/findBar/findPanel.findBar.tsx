import { CaseSensitive, ChevronDown, ChevronUp, WholeWord, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import { useResolvedHotkeys } from "@/hooks/hotkeys.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { useKeybindTitle } from "@/hooks/keybindTitle.hook";
import { isTextEntryTarget } from "@/lib/core/filterHotkeys.utils";
import {
  applyPageFindHighlights,
  clearPageFindHighlights,
  scrollMatchIntoView,
  searchPageFind,
  stepPageFindIndex,
} from "@/lib/core/pageFind.utils";
import { useCell } from "@/lib/core/signal.hook";
import {
  closeFindBar,
  findBarAtoms,
  setFindBarCaseSensitive,
  setFindBarWholeWords,
} from "@/store/findBar.store";

export function FindPanel({ virtualOnly }: { virtualOnly: boolean }) {
  const { t } = useI18n();
  const options = useCell(findBarAtoms.bar);
  const [query, setQuery] = useState<string>("");
  const [index, setIndex] = useState<number>(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const collection = useMemo(
    () =>
      searchPageFind(query, {
        caseSensitive: options.caseSensitive,
        wholeWords: options.wholeWords,
      }),
    [query, options.caseSensitive, options.wholeWords]
  );
  const total = collection.matches.length;
  const safeIndex = total === 0 ? -1 : Math.min(index, total - 1);
  const current = safeIndex < 0 ? 0 : safeIndex + 1;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    applyPageFindHighlights(collection.matches, safeIndex);
    scrollMatchIntoView(collection.matches[safeIndex]);
    return () => clearPageFindHighlights();
  }, [collection, safeIndex]);

  const step = (delta: number): void => {
    if (total === 0) return;
    setIndex((prev) => stepPageFindIndex(prev, delta, total));
  };

  useResolvedHotkeys<"find-next" | "find-prev">(
    [
      { id: "find-next", chord: "KeyN", repeat: "once", keybindId: "find.next" },
      { id: "find-prev", chord: "Shift+KeyN", repeat: "once", keybindId: "find.prev" },
    ],
    {
      ignore: (event) => isTextEntryTarget(event.target),
      onAction: (id) => step(id === "find-next" ? 1 : -1),
    }
  );

  const toggleClass = (active: boolean): string => (active ? "bg-secondary text-title-text" : "");
  const prevTitle = useKeybindTitle(t("findbar.prev"), "find.prev");
  const nextTitle = useKeybindTitle(t("findbar.next"), "find.next");

  return (
    <section
      data-find-bar
      role="search"
      aria-label={t("findbar.placeholder")}
      className="windows95-border bg-primary fixed right-2 bottom-8 z-[70] flex items-center gap-1 p-1"
    >
      <Input
        ref={inputRef}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setIndex(0);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            step(event.shiftKey ? -1 : 1);
          }
        }}
        placeholder={t("findbar.placeholder")}
        aria-label={t("findbar.placeholder")}
        spellCheck={false}
        className="w-48"
      />
      <span className="windows95-text text-text inline-block min-w-[9ch] text-xs whitespace-nowrap tabular-nums">
        {t("findbar.count", { current, total })}
      </span>
      <Button
        size="icon"
        className="h-5 w-5"
        title={prevTitle}
        aria-label={t("findbar.prev")}
        onClick={() => step(-1)}
      >
        <ChevronUp className="size-3" />
      </Button>
      <Button
        size="icon"
        className="h-5 w-5"
        title={nextTitle}
        aria-label={t("findbar.next")}
        onClick={() => step(1)}
      >
        <ChevronDown className="size-3" />
      </Button>
      <Button
        size="icon"
        className={`h-5 w-5 ${toggleClass(options.caseSensitive)}`}
        title={t("findbar.case")}
        aria-label={t("findbar.case")}
        aria-pressed={options.caseSensitive}
        onClick={() => setFindBarCaseSensitive(!options.caseSensitive)}
      >
        <CaseSensitive className="size-3" />
      </Button>
      <Button
        size="icon"
        className={`h-5 w-5 ${toggleClass(options.wholeWords)}`}
        title={t("findbar.words")}
        aria-label={t("findbar.words")}
        aria-pressed={options.wholeWords}
        onClick={() => setFindBarWholeWords(!options.wholeWords)}
      >
        <WholeWord className="size-3" />
      </Button>
      {collection.truncated && (
        <span className="windows95-text text-hint text-xs" title={t("findbar.truncated")}>
          {t("findbar.truncated")}
        </span>
      )}
      {virtualOnly && (
        <span className="windows95-text text-hint text-xs" title={t("findbar.visible.only")}>
          {t("findbar.visible.only")}
        </span>
      )}
      <Button
        size="icon"
        className="h-5 w-5"
        title={t("findbar.close")}
        aria-label={t("findbar.close")}
        onClick={() => closeFindBar()}
      >
        <X className="size-3" />
      </Button>
    </section>
  );
}
