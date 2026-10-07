import { cn } from "cn";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, RefObject } from "react";

import { Input } from "@/components/ui/input.component";
import { AUTOCOMPLETE_HISTORY_LIMIT } from "@/config/search/autocomplete.config";
import { useI18n } from "@/hooks/i18n.hook";
import {
  findSubsequenceRanges,
  mergeRanges,
  splitByRanges,
} from "@/lib/highlight/highlight.utils";
import {
  computeGhostValue,
  getAriaAutocomplete,
} from "@/lib/search/highlight.utils";
import { groupSuggestions, rankHistoryEntries } from "@/lib/search/suggestions.utils";
import type { SearchSuggestion } from "@/lib/search/suggestions.utils";
import { useCell } from "@/lib/state/signal.hook";
import { createListNavigationHandler } from "@/lib/utils/keyboard.utils";
import { settingsAtoms } from "@/store/settings.store";
import type { AutocompleteInputProps, HighlightRange, SpellCheck } from "@/types/search";

import { BackdropLayer } from "./backdrop.autocomplete";
import { SuggestionMenu } from "./menu.autocomplete";

const EMPTY_SUGGESTIONS: SearchSuggestion[] = [];
const EMPTY_RANGES: readonly HighlightRange[] = [];
const EMPTY_SPELL_RANGES: readonly HighlightRange[] = [];

function spellRangeOf(check: SpellCheck | null): readonly HighlightRange[] {
  if (!check) return EMPTY_SPELL_RANGES;
  const kind: HighlightRange["kind"] = check.severity === "error" ? "spell-error" : "spell-warn";
  return [{ start: check.start, end: check.end, kind }];
}

function spellRectOf(backdrop: HTMLDivElement | null): DOMRect | null {
  const span = backdrop?.querySelector("[data-spell]");
  if (!span) return null;
  const rect = (span as HTMLElement).getBoundingClientRect();
  if (rect.width <= 0) return null;
  return rect;
}

function spellHit(rect: DOMRect | null, clientX: number, clientY: number): boolean {
  if (!rect) return false;
  return (
    clientX >= rect.left &&
    clientX <= rect.right &&
    clientY >= rect.top - 4 &&
    clientY <= rect.bottom + 4
  );
}

const SPELL_CARD_HALF = 128;

function clampSpellX(center: number, wrap: HTMLDivElement | null): number {
  const width = wrap?.getBoundingClientRect().width ?? 0;
  if (width <= SPELL_CARD_HALF * 2) return Math.max(center, 0);
  return Math.min(Math.max(center, SPELL_CARD_HALF), width - SPELL_CARD_HALF);
}

function SpellQuickFix({
  x,
  check,
  query,
  onApply,
  onSave,
}: {
  x: number;
  check: SpellCheck;
  query: string;
  onApply?: () => void;
  onSave?: () => void;
}) {
  const { t } = useI18n();
  const diff = useMemo(
    () => splitByRanges(check.correction, findSubsequenceRanges(check.correction, query)),
    [check.correction, query]
  );
  return (
    <div
      role="tooltip"
      onMouseDown={(event) => event.preventDefault()}
      className="windows95-border bg-primary windows95-text absolute top-full z-50 mt-0.5 flex max-w-80 -translate-x-1/2 items-center gap-1 px-1 py-0.5 text-xs"
      style={{ left: `${x}px` }}
    >
      <span className="min-w-0 flex-1 truncate font-bold">
        <span>{check.word}</span>
        <span aria-hidden="true">{" -> "}</span>
        <span>
          {diff.map((token, index) =>
            token.highlighted ? (
              <span key={index} className="text-highlight">
                {token.text}
              </span>
            ) : (
              <span key={index}>{token.text}</span>
            )
          )}
        </span>
      </span>
      <button
        type="button"
        title={t("search.spell.apply.title")}
        aria-label={t("search.spell.apply.title")}
        onClick={onApply}
        className="windows95-small-border bg-primary windows95-text shrink-0 px-1 py-px font-bold hover:bg-surface active:translate-x-px active:translate-y-px"
      >
        {t("search.spell.apply")}
      </button>
      <kbd
        aria-hidden="true"
        title={t("search.spell.apply.title")}
        className="windows95-small-border bg-field windows95-text shrink-0 px-1 py-px font-bold"
      >
        Tab
      </kbd>
      <button
        type="button"
        title={t("search.spell.save.word.title")}
        aria-label={t("search.spell.save.word.title")}
        onClick={onSave}
        className="windows95-small-border bg-primary windows95-text shrink-0 px-1 py-px font-bold hover:bg-surface active:translate-x-px active:translate-y-px"
      >
        {t("search.spell.save.word")}
      </button>
      <kbd
        aria-hidden="true"
        title={t("search.spell.save.word.title")}
        className="windows95-small-border bg-field windows95-text shrink-0 px-1 py-px font-bold"
      >
        Ctrl+Tab
      </kbd>
    </div>
  );
}

function SpellHoverTip({
  x,
  check,
  query,
  onApply,
  onSave,
}: {
  x: number | null;
  check: SpellCheck | null;
  query: string;
  onApply?: () => void;
  onSave?: () => void;
}) {
  if (x === null || !check) return null;
  return <SpellQuickFix x={x} check={check} query={query} onApply={onApply} onSave={onSave} />;
}

function useSpellAnchor(
  backdropRef: RefObject<HTMLDivElement | null>,
  wrapRef: RefObject<HTMLDivElement | null>,
  spellCheck: SpellCheck | null,
  currentValue: string,
  focused: boolean,
  hoverX: number | null
) {
  const [autoX, setAutoX] = useState<number | null>(null);

  useEffect(() => {
    if (!spellCheck || !focused) {
      setAutoX(null);
      return;
    }
    const rect = spellRectOf(backdropRef.current);
    const wrap = wrapRef.current;
    if (!rect || !wrap) {
      setAutoX(null);
      return;
    }
    const wrapRect = wrap.getBoundingClientRect();
    setAutoX(clampSpellX(rect.left - wrapRect.left + rect.width / 2, wrap));
  }, [spellCheck, currentValue, focused, backdropRef, wrapRef]);

  return { spellX: hoverX ?? autoX, clearAutoX: () => setAutoX(null) };
}

function handleSpellTab(
  event: { key: string; ctrlKey: boolean; shiftKey: boolean; preventDefault: () => void },
  spellCheck: SpellCheck | null,
  onApplySpellCorrection: (() => void) | undefined,
  onApplied: () => void
): boolean {
  if (
    event.key !== "Tab" ||
    event.ctrlKey ||
    event.shiftKey ||
    !spellCheck ||
    !onApplySpellCorrection
  ) {
    return false;
  }
  event.preventDefault();
  onApplySpellCorrection();
  onApplied();
  return true;
}

function handleSpellSaveTab(
  event: { key: string; ctrlKey: boolean; shiftKey: boolean; preventDefault: () => void },
  spellCheck: SpellCheck | null,
  onAddWordToDictionary: (() => void) | undefined,
  onSaved: () => void
): boolean {
  if (
    event.key !== "Tab" ||
    !event.ctrlKey ||
    event.shiftKey ||
    !spellCheck ||
    !onAddWordToDictionary
  ) {
    return false;
  }
  event.preventDefault();
  onAddWordToDictionary();
  onSaved();
  return true;
}

function useSpellInteraction(
  backdropRef: RefObject<HTMLDivElement | null>,
  wrapRef: RefObject<HTMLDivElement | null>,
  spellCheck: SpellCheck | null,
  onApplySpellCorrection?: () => void,
  onAddWordToDictionary?: () => void
) {
  const [spellHoverX, setSpellHoverX] = useState<number | null>(null);

  const spellSpanRect = (): DOMRect | null => spellRectOf(backdropRef.current);

  const handleSpellMove = (event: { clientX: number; clientY: number }) => {
    const rect = spellCheck ? spellSpanRect() : null;
    const wrap = wrapRef.current?.getBoundingClientRect();
    if (!rect || !wrap || !spellHit(rect, event.clientX, event.clientY)) {
      setSpellHoverX(null);
      return;
    }
    setSpellHoverX(rect.left - wrap.left + rect.width / 2);
  };

  const handleSpellClick = (event: {
    clientX: number;
    clientY: number;
    preventDefault: () => void;
  }) => {
    if (!spellCheck || !spellHit(spellSpanRect(), event.clientX, event.clientY)) return false;
    event.preventDefault();
    onApplySpellCorrection?.();
    setSpellHoverX(null);
    return true;
  };

  const handleSpellContextMenu = (event: {
    clientX: number;
    clientY: number;
    preventDefault: () => void;
  }) => {
    if (!spellCheck || !spellHit(spellSpanRect(), event.clientX, event.clientY)) return false;
    event.preventDefault();
    onAddWordToDictionary?.();
    setSpellHoverX(null);
    return true;
  };

  const clearSpellHover = () => {
    setSpellHoverX(null);
  };

  return {
    spellHoverX,
    handleSpellMove,
    handleSpellClick,
    handleSpellContextMenu,
    clearSpellHover,
  };
}

export function InlineAutocompleteInput({
  className,
  completion,
  history,
  onAcceptCompletion,
  onBlur,
  onDismissCompletion,
  onFocus,
  onKeyDown,
  onRemoveHistory,
  onSelectSuggestion,
  onScroll,
  placement = "below",
  suggestions = EMPTY_SUGGESTIONS,
  highlightRanges = EMPTY_RANGES,
  spellCheck = null,
  onApplySpellCorrection,
  onAddWordToDictionary,
  historyStats,
  value,
  ...props
}: AutocompleteInputProps) {
  const [dismissed, setDismissed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [focused, setFocused] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const {
    spellHoverX,
    handleSpellMove,
    handleSpellClick,
    handleSpellContextMenu,
    clearSpellHover,
  } = useSpellInteraction(
    backdropRef,
    wrapRef,
    spellCheck,
    onApplySpellCorrection,
    onAddWordToDictionary
  );
  const [menuWidth, setMenuWidth] = useState<number | undefined>(undefined);
  const listboxId = useId();

  const mode = useCell(settingsAtoms.autocompleteMode);
  const enabled = mode !== "off";
  const currentValue = typeof value === "string" ? value : "";
  const isEmptyQuery = currentValue.trim().length === 0;

  const emptyHistorySuggestions = useMemo(
    () =>
      rankHistoryEntries(history ?? [], historyStats, AUTOCOMPLETE_HISTORY_LIMIT).map((entry) => ({
        kind: "history" as const,
        score: 0,
        value: entry,
      })),
    [history, historyStats]
  );

  const { items: groupedSuggestions, sections } = useMemo(
    () => groupSuggestions(isEmptyQuery ? emptyHistorySuggestions : suggestions),
    [emptyHistorySuggestions, isEmptyQuery, suggestions]
  );

  const showMenu =
    enabled && mode !== "inline" && !dismissed && focused && groupedSuggestions.length > 0;
  const safeActiveIndex = showMenu ? Math.min(activeIndex, groupedSuggestions.length - 1) : -1;
  const activeSuggestion = safeActiveIndex >= 0 ? groupedSuggestions[safeActiveIndex] : undefined;
  const ghostValue = computeGhostValue({
    mode,
    enabled,
    dismissed,
    focused,
    activeSuggestion,
    completion,
    currentValue,
  });
  const ghostSuffix = ghostValue ? ghostValue.slice(currentValue.length) : "";
  const spellRanges = useMemo(() => spellRangeOf(spellCheck), [spellCheck]);
  const highlightSegments = useMemo(
    () =>
      splitByRanges(
        currentValue,
        mergeRanges([...(highlightRanges ?? EMPTY_RANGES), ...spellRanges], currentValue.length)
      ),
    [currentValue, highlightRanges, spellRanges]
  );
  const hasHighlight = highlightSegments.some((s) => s.highlighted);
  const { spellX, clearAutoX } = useSpellAnchor(
    backdropRef,
    wrapRef,
    spellCheck,
    currentValue,
    focused,
    spellHoverX
  );

  const applySpellFromCard = () => {
    onApplySpellCorrection?.();
    clearSpellHover();
    clearAutoX();
  };
  const saveSpellFromCard = () => {
    onAddWordToDictionary?.();
    clearSpellHover();
    clearAutoX();
  };

  useEffect(() => {
    setDismissed(false);
    setActiveIndex(-1);
  }, []);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const update = () => setMenuWidth(input.offsetWidth);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(input);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!showMenu || safeActiveIndex < 0 || !listRef.current) return;
    listRef.current
      .querySelector<HTMLElement>(`[data-index="${safeActiveIndex}"]`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [safeActiveIndex, showMenu]);

  useEffect(() => {
    if (showMenu) scrollRef.current?.scrollTo?.(0, 0);
  }, [showMenu]);

  const selectSuggestion = (suggestion: SearchSuggestion) => {
    onSelectSuggestion?.(suggestion.value);
    onAcceptCompletion?.(suggestion.value);
    setActiveIndex(-1);
  };

  const listNavigationHandler = createListNavigationHandler<HTMLInputElement>({
    activeIndex: safeActiveIndex,
    count: groupedSuggestions.length,
    enabled: showMenu,
    setActiveIndex,
    onEnter: (index) => selectSuggestion(groupedSuggestions[index]),
    onTab: (index) => selectSuggestion(groupedSuggestions[index]),
    onEscape: () => {
      if (!ghostValue && !showMenu && !completion) return false;
      setDismissed(true);
      setActiveIndex(-1);
      onDismissCompletion?.();
      return true;
    },
    onUnhandled: (event) => {
      if (event.key === "Tab" && !event.shiftKey && ghostValue && onAcceptCompletion) {
        event.preventDefault();
        onAcceptCompletion(ghostValue);
        return;
      }
      if (
        handleSpellTab(event, spellCheck, onApplySpellCorrection, () => {
          clearSpellHover();
          clearAutoX();
        })
      ) {
        return;
      }
      onKeyDown?.(event);
    },
  });

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (
      handleSpellSaveTab(event, spellCheck, onAddWordToDictionary, () => {
        clearSpellHover();
        clearAutoX();
      })
    ) {
      return;
    }
    listNavigationHandler(event);
  };

  return (
    <div ref={wrapRef} className="relative min-w-0 flex-1">
      <div className={cn("relative", className)}>
        {enabled && (
          <div aria-hidden="true" className="bg-field pointer-events-none absolute inset-0 z-0" />
        )}
        <BackdropLayer
          currentValue={currentValue}
          highlightSegments={highlightSegments}
          hasHighlight={hasHighlight}
          ghostSuffix={ghostSuffix}
          backdropRef={backdropRef}
        />
        <Input
          {...props}
          ref={inputRef}
          aria-activedescendant={activeSuggestion ? `${listboxId}-${safeActiveIndex}` : undefined}
          aria-autocomplete={getAriaAutocomplete(mode)}
          aria-controls={showMenu ? listboxId : undefined}
          aria-expanded={showMenu || undefined}
          aria-haspopup={enabled ? "listbox" : undefined}
          aria-keyshortcuts="Tab, Control+Tab, Enter, Escape, ArrowDown, ArrowUp, Home, End"
          className={cn(
            "relative z-10 h-full w-full bg-transparent",
            hasHighlight && "selection:bg-highlight/30 caret-text text-transparent"
          )}
          onScroll={(event) => {
            if (backdropRef.current)
              backdropRef.current.scrollLeft = event.currentTarget.scrollLeft;
            onScroll?.(event);
          }}
          onMouseMove={handleSpellMove}
          onMouseLeave={clearSpellHover}
          onClick={(event) => {
            if (!handleSpellClick(event)) props.onClick?.(event);
          }}
          onContextMenu={(event) => {
            if (!handleSpellContextMenu(event)) props.onContextMenu?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            setActiveIndex(-1);
            onBlur?.(event);
          }}
          onFocus={(event) => {
            setFocused(true);
            setDismissed(false);
            onFocus?.(event);
          }}
          onKeyDown={handleInputKeyDown}
          value={value}
        />
        <SpellHoverTip
          x={spellX}
          check={spellCheck}
          query={currentValue}
          onApply={applySpellFromCard}
          onSave={saveSpellFromCard}
        />
        {showMenu && (
          <SuggestionMenu
            listboxId={listboxId}
            listRef={listRef}
            scrollRef={scrollRef}
            menuWidth={menuWidth}
            sections={sections}
            items={groupedSuggestions}
            activeIndex={safeActiveIndex}
            isEmptyQuery={isEmptyQuery}
            currentValue={currentValue}
            onHover={setActiveIndex}
            onSelect={selectSuggestion}
            onRemoveHistory={onRemoveHistory}
            placement={placement}
          />
        )}
      </div>
    </div>
  );
}
