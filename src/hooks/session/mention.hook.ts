import { useState, type KeyboardEvent } from "react";

/** Matches a trailing `@partial` at the end of the draft (may span spaces). */
const MENTION_QUERY_RX = /(?:^|\s)@([^@\n]*)$/;

/** At most this many roster names are offered in the autocomplete menu. */
const MENTION_MAX = 8;

export interface MentionAutocomplete {
  /** The suggestion menu should be rendered. */
  open: boolean;
  /** Roster names matching the trailing `@query`. */
  matches: string[];
  /** Highlighted row, clamped to the current match count. */
  activeIndex: number;
  /** Put `@Name ` into the draft, replacing the trailing `@query`. */
  apply: (name: string) => void;
  /** Wire to the composer input's `onKeyDown`. */
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  /** Call on every draft edit: re-opens the menu after Escape. */
  reset: () => void;
}

/**
 * `@mention` autocomplete for the chat composer. The query runs from the last
 * `@` (not crossed by another `@`) to the end of the draft, so roster names
 * containing spaces still match. Escape hides the menu until the next edit;
 * ArrowUp/ArrowDown cycle and Enter picks, so Enter no longer sends the message
 * while the menu is open.
 */
export function useMentionAutocomplete(
  draft: string,
  mentionNames: readonly string[],
  onDraftChange: (value: string) => void
): MentionAutocomplete {
  const [hidden, setHidden] = useState(false);
  const [index, setIndex] = useState(0);

  const query = MENTION_QUERY_RX.exec(draft);
  const queryText = query !== null ? (query[1] ?? "") : null;
  const needle = queryText !== null ? queryText.trim().toLowerCase() : null;
  const matches =
    needle !== null && !hidden
      ? mentionNames
          .filter((name) =>
            name.trim().toLowerCase().startsWith(needle)
          )
          .slice(0, MENTION_MAX)
      : [];
  const activeIndex = index < matches.length ? index : 0;

  const apply = (name: string) => {
    if (query === null || name.length === 0) return;
    // The match runs to the end of the draft, so `@` sits just before the query.
    const start = draft.length - (query[1]?.length ?? 0) - 1;
    onDraftChange(`${draft.slice(0, start)}@${name} `);
    setHidden(true);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (matches.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIndex((activeIndex + 1) % matches.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setIndex((activeIndex - 1 + matches.length) % matches.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      apply(matches[activeIndex] ?? "");
    } else if (event.key === "Escape") {
      event.preventDefault();
      setHidden(true);
    }
  };

  const reset = () => {
    setHidden(false);
    setIndex(0);
  };

  return { open: matches.length > 0, matches, activeIndex, apply, onKeyDown, reset };
}
