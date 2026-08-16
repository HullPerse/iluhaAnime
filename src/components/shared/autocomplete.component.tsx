import {
  Film,
  HardDrive,
  History,
  Magnet,
  type LucideIcon,
} from "lucide-react";
import * as React from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { Input } from "@/components/ui/input.component";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { cn } from "@/lib/index.utils";
import { createListNavigationHandler } from "@/lib/keyboard.utils";
import type { SearchSuggestion } from "@/lib/search.suggestions";
import { useSettingsStore } from "@/store/settings.store";

interface Props extends React.ComponentProps<typeof Input> {
  completion?: string | null;
  history?: string[];
  suggestions?: SearchSuggestion[];
  onAcceptCompletion?: (value: string) => void;
  onSelectSuggestion?: (value: string) => void;
  onDismissCompletion?: () => void;
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

interface SuggestionSection {
  kind: SearchSuggestion["kind"];
  startIndex: number;
  endIndex: number;
}

const KIND_ORDER: SearchSuggestion["kind"][] = [
  "anime",
  "history",
  "local",
  "torrent",
];

const EMPTY_SUGGESTIONS: SearchSuggestion[] = [];

function groupSuggestions(
  suggestions: SearchSuggestion[]
): { items: SearchSuggestion[]; sections: SuggestionSection[] } {
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

interface HighlightSegment {
  text: string;
  matched: boolean;
}

function matchKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .toLocaleLowerCase();
}

function splitHighlighted(value: string, query: string): HighlightSegment[] {
  const needle = matchKey(query);
  if (!needle) return [{ text: value, matched: false }];

  const segments: HighlightSegment[] = [];
  let queryIndex = 0;
  let cursor = 0;
  let matched = false;

  for (let index = 0; index < value.length; index++) {
    const isMatch =
      queryIndex < needle.length &&
      matchKey(value[index]) === needle[queryIndex];
    if (isMatch) {
      if (!matched) {
        if (index > cursor) {
          segments.push({ text: value.slice(cursor, index), matched: false });
        }
        cursor = index;
        matched = true;
      }
      queryIndex += 1;
    } else if (matched) {
      segments.push({ text: value.slice(cursor, index), matched: true });
      cursor = index;
      matched = false;
    }
  }

  segments.push({ text: value.slice(cursor), matched });
  return segments;
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
  onSelectSuggestion,
  suggestions = EMPTY_SUGGESTIONS,
  value,
  ...props
}: Props) {
  const { t } = useI18n();
  const [dismissed, setDismissed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [focused, setFocused] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
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
        .slice(0, 12)
        .map((entry) => ({ kind: "history" as const, score: 0, value: entry })),
    [history]
  );

  const { items: groupedSuggestions, sections } = useMemo(
    () => groupSuggestions(isEmptyQuery ? emptyHistorySuggestions : suggestions),
    [emptyHistorySuggestions, isEmptyQuery, suggestions]
  );

  const showMenu =
    enabled &&
    mode !== "inline" &&
    !dismissed &&
    focused &&
    groupedSuggestions.length > 0;
  const safeActiveIndex = showMenu
    ? Math.min(activeIndex, groupedSuggestions.length - 1)
    : -1;
  const activeSuggestion =
    safeActiveIndex >= 0 ? groupedSuggestions[safeActiveIndex] : undefined;

  const ghostCandidate =
    mode === "inline" || mode === "both"
      ? (activeSuggestion?.value ?? completion ?? null)
      : null;
  const ghostValue =
    enabled &&
    (mode === "inline" || mode === "both") &&
    !dismissed &&
    focused &&
    ghostCandidate &&
    currentValue.trim().length > 0 &&
    ghostCandidate
      .toLocaleLowerCase()
      .startsWith(currentValue.toLocaleLowerCase())
      ? ghostCandidate
      : null;
  const ghostSuffix = ghostValue ? ghostValue.slice(currentValue.length) : "";

  useEffect(() => {
    setDismissed(false);
    setActiveIndex(-1);
  }, [completion, currentValue, mode]);

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

  const renderHighlighted = (candidate: string, active: boolean) =>
    splitHighlighted(candidate, currentValue).map((segment, index) =>
      segment.matched ? (
        <span
          key={index}
          className={cn(
            "text-highlight font-bold",
            active
              ? "text-white underline"
              : "group-hover:text-white group-hover:underline"
          )}
        >
          {segment.text}
        </span>
      ) : (
        <span key={index}>{segment.text}</span>
      )
    );

  return (
    <div className="relative min-w-0 flex-1">
      <div className={cn("relative", className)}>
        {enabled && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-0 bg-white"
          />
        )}
        {ghostValue && ghostSuffix && (
          <div
            aria-hidden="true"
            className="inline-autocomplete-ghost pointer-events-none absolute inset-0 z-0 flex items-center overflow-hidden border-2 border-transparent px-1.5 whitespace-pre"
            style={{
              color: "var(--color-autocomplete, var(--color-muted))",
              opacity: "var(--autocomplete-opacity, 0.6)",
            }}
          >
            <span className="windows95-text font-bold whitespace-pre">
              <span className="text-transparent">{currentValue}</span>
              {ghostSuffix}
            </span>
          </div>
        )}
        <Input
          {...props}
          ref={inputRef}
          aria-activedescendant={
            activeSuggestion ? `${listboxId}-${safeActiveIndex}` : undefined
          }
          aria-autocomplete={
            mode === "inline"
              ? "inline"
              : mode === "both"
                ? "both"
                : mode === "dropdown"
                  ? "list"
                  : "none"
          }
          aria-controls={showMenu ? listboxId : undefined}
          aria-expanded={showMenu || undefined}
          aria-haspopup={enabled ? "listbox" : undefined}
          aria-keyshortcuts="Tab, Enter, Escape, ArrowDown, ArrowUp, Home, End"
          className={cn("relative z-10 h-full w-full bg-transparent")}
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
            if (
              event.key === "Tab" &&
              !event.shiftKey &&
              ghostValue &&
              onAcceptCompletion
            ) {
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
        <div
          id={listboxId}
          ref={listRef}
          role="listbox"
          className="windows95-active-border absolute top-full left-0 z-40 mt-1 flex max-h-72 min-w-64 flex-col bg-white"
          style={{ width: menuWidth }}
        >
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto overscroll-contain p-0.5"
          >
            {sections.map((section) => (
              <div key={section.kind} role="presentation">
                {!isEmptyQuery && (
                  <div
                    data-section={section.kind}
                    className="windows95-text text-text bg-primary border-muted/40 flex items-center gap-1 border-b px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider select-none"
                  >
                    {t(suggestionKindLabels[section.kind])}
                  </div>
                )}
                {groupedSuggestions
                  .slice(section.startIndex, section.endIndex)
                  .map((suggestion, index) => {
                    const itemIndex = section.startIndex + index;
                    const active = itemIndex === safeActiveIndex;
                    const Icon = suggestionIcons[suggestion.kind];
                    return (
                      <button
                        key={`${suggestion.kind}-${suggestion.value}`}
                        id={`${listboxId}-${itemIndex}`}
                        type="button"
                        role="option"
                        data-index={itemIndex}
                        aria-selected={active}
                        className={cn(
                          "windows95-text text-text group flex w-full cursor-pointer items-center gap-1.5 px-1.5 py-1 text-left select-none",
                          active
                            ? "bg-highlight text-white"
                            : "hover:bg-highlight hover:text-white"
                        )}
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseEnter={() => setActiveIndex(itemIndex)}
                        onClick={() => selectSuggestion(suggestion)}
                      >
                        <span
                          className={cn(
                            "flex size-4 shrink-0 items-center justify-center",
                            active
                              ? "text-white"
                              : "text-muted group-hover:text-white"
                          )}
                        >
                          <Icon className="size-3.5" />
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          {renderHighlighted(suggestion.value, active)}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 text-[9px]",
                            active
                              ? "text-white/70"
                              : "text-muted group-hover:text-white/70"
                          )}
                        >
                          {suggestion.subtitle ??
                            t(suggestionKindLabels[suggestion.kind])}
                        </span>
                      </button>
                    );
                  })}
              </div>
            ))}
          </div>
          <div
            role="presentation"
            data-footer
            className="windows95-text text-text/60 bg-primary border-muted/40 flex shrink-0 items-center gap-1 border-t px-1.5 py-1 text-[9px] select-none"
          >
            {t("settings.search.autocompleteFooterHint")}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
