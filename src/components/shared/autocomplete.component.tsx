import { cn } from "cn";
import { Film, HardDrive, History, Magnet, X, type LucideIcon } from "lucide-react";
import * as React from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { Input } from "@/components/ui/input.component";
import { AUTOCOMPLETE_HISTORY_LIMIT } from "@/config/search/autocomplete.config";
import { useI18n, type TranslationKey } from "@/lib/locale/i18n.utils";
import {
  computeGhostValue,
  getAriaAutocomplete,
  splitHighlighted,
  splitHighlightRanges,
} from "@/lib/search/highlight.utils";
import type { SearchSuggestion } from "@/lib/search/suggestions.utils";
import { createListNavigationHandler } from "@/lib/utils/keyboard.utils";
import { useSettingsStore } from "@/store/settings.store";
import type { HighlightRange, HighlightToken, SuggestionSection } from "@/types/search";

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

const suggestionIcons: Record<SearchSuggestion["kind"], LucideIcon> = {
  anime: Film,
  history: History,
  local: HardDrive,
  torrent: Magnet,
};

const suggestionKindLabels: Record<SearchSuggestion["kind"], TranslationKey> = {
  anime: "search.suggestion.anime",
  history: "search.suggestion.history",
  local: "search.suggestion.local",
  torrent: "search.suggestion.torrent",
};

const KIND_ORDER: SearchSuggestion["kind"][] = ["anime", "history", "local", "torrent"];

const EMPTY_SUGGESTIONS: SearchSuggestion[] = [];

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

const EMPTY_RANGES: readonly HighlightRange[] = [];

function BackdropLayer({
  currentValue,
  highlightSegments,
  hasHighlight,
  ghostSuffix,
  backdropRef,
}: {
  currentValue: string;
  highlightSegments: HighlightToken[];
  hasHighlight: boolean;
  ghostSuffix: string;
  backdropRef: React.RefObject<HTMLDivElement | null>;
}) {
  if (!ghostSuffix && !hasHighlight) return null;
  return (
    <div
      aria-hidden="true"
      ref={backdropRef}
      className="inline-autocomplete-ghost windows95-text pointer-events-none absolute inset-0 z-0 flex items-center overflow-hidden border-2 border-transparent px-1.5 whitespace-pre"
    >
      <span className="windows95-text font-bold whitespace-pre">
        {hasHighlight ? (
          highlightSegments.map((segment, index) =>
            segment.highlighted ? (
              <span key={index} className="bg-highlight text-white">
                {segment.text}
              </span>
            ) : (
              <span key={index} className="text-text">
                {segment.text}
              </span>
            )
          )
        ) : (
          <span className="text-transparent">{currentValue}</span>
        )}
        {ghostSuffix && (
          <span
            className="windows95-text font-bold"
            style={{
              color: "var(--color-autocomplete, var(--color-muted))",
              opacity: "var(--autocomplete-opacity, 0.6)",
            }}
          >
            {ghostSuffix}
          </span>
        )}
      </span>
    </div>
  );
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

function HighlightedText({
  candidate,
  query,
  active,
}: {
  candidate: string;
  query: string;
  active: boolean;
}) {
  return (
    <>
      {splitHighlighted(candidate, query).map((segment, index) =>
        segment.matched ? (
          <span
            key={index}
            className={cn(
              "text-highlight font-bold",
              active ? "text-white underline" : "group-hover:text-white group-hover:underline"
            )}
          >
            {segment.text}
          </span>
        ) : (
          <span key={index}>{segment.text}</span>
        )
      )}
    </>
  );
}

function SuggestionItem({
  suggestion,
  itemIndex,
  active,
  listboxId,
  currentValue,
  onHover,
  onSelect,
  onRemove,
}: {
  suggestion: SearchSuggestion;
  itemIndex: number;
  active: boolean;
  listboxId: string;
  currentValue: string;
  onHover: (index: number) => void;
  onSelect: (suggestion: SearchSuggestion) => void;
  onRemove?: (value: string) => void;
}) {
  const { t } = useI18n();
  const Icon = suggestionIcons[suggestion.kind];
  return (
    <div className="flex w-full items-center">
      <div
        id={`${listboxId}-${itemIndex}`}
        role="option"
        data-index={itemIndex}
        aria-selected={active}
        tabIndex={-1}
        className={cn(
          "windows95-text text-text group flex min-w-0 flex-1 cursor-pointer items-center gap-1 px-1 py-0.5 text-left text-xs select-none",
          active ? "bg-highlight text-white" : "hover:bg-highlight hover:text-white"
        )}
        onMouseDown={(event) => event.preventDefault()}
        onMouseEnter={() => onHover(itemIndex)}
        onClick={() => onSelect(suggestion)}
      >
        <span
          className={cn(
            "flex size-4 shrink-0 items-center justify-center",
            active ? "text-white" : "text-hint group-hover:text-white"
          )}
        >
          <Icon className="size-3" />
        </span>
        <span className="min-w-0 flex-1 truncate">
          <HighlightedText candidate={suggestion.value} query={currentValue} active={active} />
        </span>
        <span
          className={cn(
            "shrink-0 text-xs",
            active ? "text-white/70" : "text-hint group-hover:text-white/70"
          )}
        >
          {suggestion.subtitle ?? t(suggestionKindLabels[suggestion.kind])}
        </span>
      </div>
      {suggestion.kind === "history" && onRemove && (
        <button
          type="button"
          aria-label={t("search.remove.from.history")}
          className={cn(
            "flex size-4 shrink-0 cursor-pointer items-center justify-center px-1",
            active ? "text-white hover:bg-white/20" : "text-hint hover:text-white"
          )}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.stopPropagation();
            onRemove(suggestion.value);
          }}
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}

function SuggestionMenu({
  listboxId,
  listRef,
  scrollRef,
  menuWidth,
  sections,
  items,
  activeIndex,
  isEmptyQuery,
  currentValue,
  onHover,
  onSelect,
  onRemoveHistory,
  placement,
}: {
  listboxId: string;
  listRef: React.RefObject<HTMLDivElement | null>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  menuWidth: number | undefined;
  sections: SuggestionSection[];
  items: SearchSuggestion[];
  activeIndex: number;
  isEmptyQuery: boolean;
  currentValue: string;
  onHover: (index: number) => void;
  onSelect: (suggestion: SearchSuggestion) => void;
  onRemoveHistory?: (query: string) => void;
  placement: "below" | "above";
}) {
  const { t } = useI18n();
  return (
    <div
      id={listboxId}
      ref={listRef}
      role="listbox"
      className={cn(
        "windows95-border absolute left-0 z-40 flex max-h-48 min-w-64 flex-col bg-white shadow-none",
        placement === "above" ? "bottom-full mb-0" : "top-full mt-0"
      )}
      style={{ width: menuWidth }}
    >
      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain p-0">
        {sections.map((section) => (
          <div key={section.kind} role="presentation">
            {!isEmptyQuery && (
              <div
                data-section={section.kind}
                className="windows95-text text-hint bg-primary flex items-center gap-1 px-1 py-0.5 text-xs font-bold tracking-wider uppercase select-none"
              >
                {t(suggestionKindLabels[section.kind])}
              </div>
            )}
            {items.slice(section.startIndex, section.endIndex).map((suggestion, index) => (
              <SuggestionItem
                key={`${suggestion.kind}-${suggestion.value}`}
                suggestion={suggestion}
                itemIndex={section.startIndex + index}
                active={section.startIndex + index === activeIndex}
                listboxId={listboxId}
                currentValue={currentValue}
                onHover={onHover}
                onSelect={onSelect}
                onRemove={onRemoveHistory}
              />
            ))}
          </div>
        ))}
      </div>
      <div
        role="presentation"
        data-footer
        className="windows95-text text-hint bg-primary flex shrink-0 items-center gap-1 px-1 py-0.5 text-xs select-none"
      >
        {t("settings.search.autocomplete.footer.hint")}
      </div>
    </div>
  );
}
