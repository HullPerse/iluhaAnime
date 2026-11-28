import { Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

import { Input } from "@/components/ui/input.component";
import { useI18n } from "@/hooks/i18n.hook";
import {
  characterGuessChoices,
  type CharacterGuessChoice,
} from "@/lib/daily/characterSearch.utils";
import { createListNavigationHandler } from "@/lib/ui/keyboard.utils";
import type { CharacterIndexEntry } from "@/types/api/characters";

/** Combobox over the tier-free character pool. Picking a row fills the canonical name. */
export default function CharacterGuessField({
  id,
  label,
  value,
  entries,
  checked,
  solved,
  disabled,
  onValueChange,
  onBlur,
}: {
  id: string;
  label: string;
  value: string;
  entries: readonly CharacterIndexEntry[];
  checked: boolean;
  solved: boolean;
  disabled: boolean;
  onValueChange: (value: string) => void;
  onBlur: () => void;
}) {
  const { t } = useI18n();
  const [focused, setFocused] = useState<boolean>(false);
  const [dismissed, setDismissed] = useState<boolean>(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const choices = useMemo(
    () => (focused && !checked ? characterGuessChoices(entries, value) : []),
    [checked, entries, focused, value]
  );
  const open = focused && !dismissed && !checked && !disabled && value.trim().length >= 2;
  const showList = open && choices.length > 0;
  const showEmpty = open && choices.length === 0;

  useEffect(() => {
    setActiveIndex(choices.length > 0 ? 0 : -1);
  }, [choices]);

  useEffect(() => {
    if (!showList || activeIndex < 0) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex, showList]);

  const choose = (choice: CharacterGuessChoice) => {
    onValueChange(choice.name);
    setDismissed(true);
    setActiveIndex(-1);
  };

  const chooseAt = (index: number) => {
    const choice = choices[index];

    if (choice) choose(choice);
  };

  const navigation = createListNavigationHandler<HTMLInputElement>({
    activeIndex: showList ? activeIndex : -1,
    count: showList ? choices.length : 0,
    enabled: showList,
    setActiveIndex,
    onEnter: chooseAt,
    onTab: chooseAt,
    onEscape: () => {
      if (!open) return false;
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
    <div className="daily-search">
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <Search />
      <Input
        ref={inputRef}
        id={id}
        className="daily-search-input"
        value={value}
        placeholder={label}
        readOnly={checked}
        aria-invalid={checked && !solved}
        aria-describedby={checked ? `${id}-status` : undefined}
        disabled={disabled}
        maxLength={160}
        onChange={(event) => {
          setDismissed(false);
          onValueChange(event.target.value);
        }}
        onFocus={() => {
          setFocused(true);
          setDismissed(false);
        }}
        onBlur={() => {
          setFocused(false);
          setActiveIndex(-1);
          onBlur();
        }}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listboxId}
        aria-activedescendant={activeId}
      />

      {showList && (
        <div
          ref={listRef}
          id={listboxId}
          className="windows95-border daily-suggestions daily-character-suggestions"
          role="listbox"
        >
          {choices.map((choice, index) => (
            <button
              key={choice.id}
              id={`${listboxId}-option-${index}`}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              data-index={index}
              className="daily-suggestion"
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => {
                choose(choice);
                inputRef.current?.focus();
              }}
            >
              <span className="daily-suggestion-copy">
                <strong>{choice.name}</strong>
                {choice.alias !== null && (
                  <span className="daily-suggestion-meta">{choice.alias}</span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}

      {showEmpty && (
        <div
          className="daily-suggestions daily-suggestions-state daily-character-suggestions"
          role="status"
        >
          {t("collection.game.guess.empty")}
        </div>
      )}

      {checked && (
        <span id={`${id}-status`} className="sr-only">
          {t(solved ? "collection.game.characters.correct" : "collection.game.characters.wrong")}
        </span>
      )}
    </div>
  );
}
