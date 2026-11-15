import { Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

import { Button } from "@/components/ui/button.component";
import Image from "@/components/ui/image.component";
import { Input } from "@/components/ui/input.component";
import { useDailyGuessSuggestions } from "@/hooks/daily/search.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { createListNavigationHandler } from "@/lib/ui/keyboard.utils";
import type { DailyGuessSuggestion } from "@/types/ui/daily";

function fieldVisibility({
  dismissed,
  focused,
  loading,
  query,
  selected,
  suggestionCount,
}: {
  dismissed: boolean;
  focused: boolean;
  loading: boolean;
  query: string;
  selected: DailyGuessSuggestion | null;
  suggestionCount: number;
}): { showList: boolean; showLoading: boolean; showState: boolean } {
  const open = focused && !dismissed && selected === null;
  const typing = query.trim().length >= 2;
  return {
    showList: open && suggestionCount > 0,
    showLoading: open && typing && loading,
    showState: open && typing && !loading && suggestionCount === 0,
  };
}

export default function DailyGuessField({
  enabled,
  onQueryChange,
  onSelect,
  pending,
  query,
  selected,
}: {
  enabled: boolean;
  onQueryChange: (value: string) => void;
  onSelect: (suggestion: DailyGuessSuggestion | null) => void;
  pending: boolean;
  query: string;
  selected: DailyGuessSuggestion | null;
}) {
  const { t } = useI18n();
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const { suggestions, loading } = useDailyGuessSuggestions(query, enabled && selected === null);
  const { showList, showLoading, showState } = fieldVisibility({
    dismissed,
    focused,
    loading,
    query,
    selected,
    suggestionCount: suggestions.length,
  });

  useEffect(() => {
    setActiveIndex(suggestions.length > 0 ? 0 : -1);
  }, [suggestions]);

  useEffect(() => {
    if (!showList || activeIndex < 0) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex, showList]);

  const choose = (suggestion: DailyGuessSuggestion) => {
    onSelect(suggestion);
    onQueryChange(suggestion.title);
    setDismissed(true);
    setActiveIndex(-1);
  };

  const navigation = createListNavigationHandler<HTMLInputElement>({
    activeIndex: showList ? activeIndex : -1,
    count: showList ? suggestions.length : 0,
    enabled: showList,
    setActiveIndex,
    onEnter: (index) => choose(suggestions[index] as DailyGuessSuggestion),
    onTab: (index) => choose(suggestions[index] as DailyGuessSuggestion),
    onEscape: () => {
      if (!showList) return false;
      setDismissed(true);
      setActiveIndex(-1);
      return true;
    },
  });

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    navigation(event);
  };

  const activeId = showList && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined;

  return (
    <>
      <div className="daily-search">
        <Search />
        <Input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setDismissed(false);
            onSelect(null);
            onQueryChange(event.target.value);
          }}
          onFocus={() => {
            setFocused(true);
            setDismissed(false);
          }}
          onBlur={() => {
            setFocused(false);
            setActiveIndex(-1);
          }}
          onKeyDown={handleKeyDown}
          className="daily-search-input"
          placeholder={t("collection.game.guess.placeholder")}
          aria-label={t("collection.game.guess.placeholder")}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listboxId}
          aria-activedescendant={activeId}
          autoFocus
          disabled={pending}
        />
      </div>

      {selected !== null && (
        <div className="windows95-border daily-selected">
          {selected.coverUrl !== null && (
            <Image src={selected.coverUrl} alt={selected.title} className="daily-selected-cover" />
          )}
          <div className="daily-selected-copy">
            <strong>{selected.title}</strong>
            <span>{t("collection.game.selected")}</span>
          </div>
          <Button
            type="button"
            size="icon"
            className="daily-mini-btn"
            aria-label={t("collection.game.clearAnswer")}
            title={t("collection.game.clearAnswer")}
            onClick={() => {
              onSelect(null);
              onQueryChange("");
              setDismissed(false);
              inputRef.current?.focus();
            }}
          >
            <X className="size-3" />
          </Button>
        </div>
      )}

      {showList && (
        <div
          ref={listRef}
          id={listboxId}
          className="windows95-border daily-suggestions"
          role="listbox"
        >
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.id}
              id={`${listboxId}-option-${index}`}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              data-index={index}
              className="daily-suggestion"
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => {
                choose(suggestion);
                inputRef.current?.focus();
              }}
            >
              {suggestion.coverUrl !== null && (
                <Image src={suggestion.coverUrl} alt="" className="daily-suggestion-cover" />
              )}
              <span className="daily-suggestion-copy">
                <strong>{suggestion.title}</strong>
                <span className="daily-suggestion-meta">
                  {[suggestion.alias, suggestion.year, suggestion.format]
                    .filter((value) => value !== null)
                    .join(" / ")}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {showLoading && (
        <div className="daily-suggestions daily-suggestions-state" role="status">
          {t("collection.game.guess.loading")}
        </div>
      )}
      {showState && (
        <div className="daily-suggestions daily-suggestions-state" role="status">
          {t("collection.game.guess.empty")}
        </div>
      )}
    </>
  );
}
