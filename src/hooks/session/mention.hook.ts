import { useState, type KeyboardEvent } from "react";

const MENTION_QUERY_RX = /(?:^|\s)@([^@\n]*)$/;

const MENTION_MAX = 8;

export interface MentionAutocomplete {
  open: boolean;
  matches: string[];
  activeIndex: number;
  apply: (name: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  reset: () => void;
}

// Enter picks while menu open, not send.
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
