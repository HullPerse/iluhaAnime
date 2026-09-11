import { cn } from "cn";
import * as React from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { Input } from "@/components/ui/input.component";
import { AUTOCOMPLETE_HISTORY_LIMIT } from "@/config/search/autocomplete.config";
import {
  computeGhostValue,
  getAriaAutocomplete,
  splitHighlightRanges,
} from "@/lib/search/highlight.utils";
import type { SearchSuggestion } from "@/lib/search/suggestions.utils";
import { createListNavigationHandler } from "@/lib/utils/keyboard.utils";
import { useSettingsStore } from "@/store/settings.store";
import type { HighlightRange, SuggestionSection } from "@/types/search";

import { BackdropLayer } from "./backdrop.autocomplete";
import { SuggestionMenu } from "./menu.autocomplete";

interface Props extends React.ComponentProps<typeof Input> {
  completion?: string | null;
  history?: string[];
  suggestions?: SearchSuggestion[];
  onAcceptCompletion?: (value: string) => void;
  onRemoveHistory?: (query: string) => void;
  onSelectSuggestion?: (value: string) => void;
  onDismissCompletion?: () => void;
  highlightRanges?: readonly HighlightRange[];
  placement?: "below" | "above";
}

const KIND_ORDER: SearchSuggestion["kind"][] = ["anime", "history", "local", "torrent"];

const EMPTY_SUGGESTIONS: SearchSuggestion[] = [];
const EMPTY_RANGES: readonly HighlightRange[] = [];

function groupSuggestions(suggestions: SearchSuggestion[]): {
  items: SearchSuggestion[];
  sections: SuggestionSection[];
} {
  const groups = new Map<SearchSuggestion["kind"], SearchSuggestion[]>();
  for (const suggestion of suggestions) {
    const group = groups.get(suggestion.kind) ?? [];
    group.push(suggestion);
    groups.set(suggestion.kind, group);
  }
  if (groups.size === 0) return { items: [], sections: [] };
  const order = [...groups.keys()].sort((left, right) => {
    const leftBest = groups.get(left)?.[0]?.score ?? 0;
    const rightBest = groups.get(right)?.[0]?.score ?? 0;
    if (rightBest !== leftBest) return rightBest - leftBest;
    return KIND_ORDER.indexOf(left) - KIND_ORDER.indexOf(right);
  });
  const items: SearchSuggestion[] = [];
  const sections: SuggestionSection[] = [];
  for (const kind of order) {
    const group = groups.get(kind)!;
    sections.push({
      kind,
      startIndex: items.length,
      endIndex: items.length + group.length,
    });
    items.push(...group);
  }
  return { items, sections };
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
  value,
  ...props
}: Props) {
  const [dismissed, setDismissed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [focused, setFocused] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const [menuWidth, setMenuWidth] = useState<number | undefined>(undefined);
  const listboxId = useId();

  const mode = useSettingsStore((state) => state.autocompleteMode);
  const enabled = mode !== "off";
  const currentValue = typeof value === "string" ? value : "";
  const isEmptyQuery = currentValue.trim().length === 0;

  const emptyHistorySuggestions = useMemo(
    () =>
      (history ?? [])
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
        .slice(0, AUTOCOMPLETE_HISTORY_LIMIT)
        .map((entry) => ({ kind: "history" as const, score: 0, value: entry })),
    [history]
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
  const highlightSegments = useMemo(
    () => splitHighlightRanges(currentValue, highlightRanges ?? EMPTY_RANGES),
    [currentValue, highlightRanges]
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

  const selectSuggestion = (suggestion: SearchSuggestion) => {
    onSelectSuggestion?.(suggestion.value);
    onAcceptCompletion?.(suggestion.value);
    setActiveIndex(-1);
  };

  return (
    <div className="relative min-w-0 flex-1">
      <div className={cn("relative", className)}>
        {enabled && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 bg-white" />
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
          aria-keyshortcuts="Tab, Enter, Escape, ArrowDown, ArrowUp, Home, End"
          className={cn(
            "relative z-10 h-full w-full bg-transparent",
            hasHighlight && "selection:bg-highlight/30 caret-text text-transparent"
          )}
          onScroll={(event) => {
            if (backdropRef.current)
              backdropRef.current.scrollLeft = event.currentTarget.scrollLeft;
            onScroll?.(event);
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
          onKeyDown={createListNavigationHandler({
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
              onKeyDown?.(event);
            },
          })}
          value={value}
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
