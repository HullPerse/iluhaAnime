import { cn } from "cn";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

import { Input } from "@/components/ui/input.component";
import { AUTOCOMPLETE_HISTORY_LIMIT } from "@/config/search/autocomplete.config";
import { handleSpellSaveTab, handleSpellTab, spellRangeOf } from "@/lib/search/spell.utils";
import { useSpellInteraction } from "@/hooks/search/spellInteraction.hook";
import {
  autocompleteFieldA11y,
  autocompleteFieldClassName,
} from "@/lib/search/autocompleteField.utils";
import { mergeRanges, splitByRanges } from "@/lib/core/highlight.utils";
import { computeGhostValue } from "@/lib/search/searchHighlight.utils";
import { groupSuggestions, rankHistoryEntries } from "@/lib/core/suggestions.utils";
import type { SearchSuggestion } from "@/lib/core/suggestions.utils";
import { useCell } from "@/lib/core/signal.hook";
import { createListNavigationHandler } from "@/lib/ui/keyboard.utils";
import { settingsAtoms } from "@/store/settings.store";
import type { AutocompleteInputProps, HighlightRange } from "@/types/search/search";

import { BackdropLayer } from "@/components/shared/autocomplete/backdrop.autocomplete";
import { SuggestionMenu } from "@/components/shared/autocomplete/menu.autocomplete";
import { SpellCorrectionsPanel } from "@/components/shared/autocomplete/spellCorrectionsPanel.autocomplete";

const EMPTY_SUGGESTIONS: SearchSuggestion[] = [];
const EMPTY_CORRECTIONS: string[] = [];
const EMPTY_RANGES: readonly HighlightRange[] = [];

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
  spellCorrections = EMPTY_CORRECTIONS,
  onApplySpellCorrection,
  onApplySpellCorrectionAt,
  onAddWordToDictionary,
  historyStats,
  historyScope,
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
  const { handleSpellClick, handleSpellContextMenu } = useSpellInteraction(
    backdropRef,
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
      rankHistoryEntries(history ?? [], historyStats, AUTOCOMPLETE_HISTORY_LIMIT, historyScope).map(
        (entry) => ({
          kind: "history" as const,
          score: 0,
          value: entry,
        })
      ),
    [history, historyStats, historyScope]
  );

  const spellItems = useMemo<SearchSuggestion[]>(
    () =>
      spellCorrections.map((correction) => ({
        kind: "spell" as const,
        score: 0,
        value: correction,
      })),
    [spellCorrections]
  );

  const { items: groupedSuggestions, sections } = useMemo(
    () =>
      groupSuggestions(isEmptyQuery ? emptyHistorySuggestions : [...spellItems, ...suggestions]),
    [emptyHistorySuggestions, isEmptyQuery, spellItems, suggestions]
  );

  const showMenu =
    enabled && mode !== "inline" && !dismissed && focused && groupedSuggestions.length > 0;
  const showSpellPanel = focused && !dismissed && !showMenu && spellCorrections.length > 0;
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

  const selectSuggestion = useCallback(
    (suggestion: SearchSuggestion) => {
      if (suggestion.kind === "spell") {
        onApplySpellCorrectionAt?.(suggestion.value);
        setActiveIndex(-1);
        return;
      }
      onSelectSuggestion?.(suggestion.value);
      onAcceptCompletion?.(suggestion.value);
      setActiveIndex(-1);
    },
    [onSelectSuggestion, onAcceptCompletion, onApplySpellCorrectionAt]
  );

  const listNavigationHandler = createListNavigationHandler<HTMLInputElement>({
    activeIndex: safeActiveIndex,
    count: groupedSuggestions.length,
    enabled: showMenu,
    setActiveIndex,
    onEnter: (index) => selectSuggestion(groupedSuggestions[index]),
    onTab: (index) => selectSuggestion(groupedSuggestions[index]),
    onEscape: () => {
      if (!ghostValue && !showMenu && !completion && spellCorrections.length === 0) return false;
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
      if (handleSpellTab(event, spellCheck, onApplySpellCorrection)) {
        return;
      }
      onKeyDown?.(event);
    },
  });

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (handleSpellSaveTab(event, spellCheck, onAddWordToDictionary)) {
      return;
    }
    listNavigationHandler(event);
  };

  const textFieldA11y = autocompleteFieldA11y(
    listboxId,
    safeActiveIndex,
    activeSuggestion,
    showMenu,
    mode,
    enabled
  );
  const textFieldClassName = autocompleteFieldClassName(hasHighlight);

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
          {...textFieldA11y}
          ref={inputRef}
          spellCheck={false}
          aria-keyshortcuts="Tab, Control+Tab, Enter, Escape, ArrowDown, ArrowUp, Home, End"
          className={textFieldClassName}
          onScroll={(event) => {
            if (backdropRef.current)
              backdropRef.current.scrollLeft = event.currentTarget.scrollLeft;
            onScroll?.(event);
          }}
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
        {showSpellPanel && (
          <SpellCorrectionsPanel
            corrections={spellCorrections}
            query={currentValue}
            onApplyAt={onApplySpellCorrectionAt}
            onSave={onAddWordToDictionary}
            placement={placement}
          />
        )}
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
