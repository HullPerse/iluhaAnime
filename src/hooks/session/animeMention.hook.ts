import { useEffect, useMemo, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { primeAnimeBrief } from "@/hooks/anilist/anime-brief.hook";
import { useAnimeInlineSearch } from "@/hooks/anilist/inline-search.hook";
import { useAnimeTitlePreference } from "@/hooks/anilist/title-preference.hook";
import { animeTitleFields, resolveAnimeTitle } from "@/lib/anilist/title.utils";
import {
  animeMentionTrigger,
  replaceAnimeMention,
  type AnimeMentionTrigger,
} from "@/lib/session/chat.utils";
import type { AniMedia, AniTitleLanguage } from "@/types/anilist";

export interface AnimeMentionComposer {
  open: boolean;
  options: AniMedia[];
  activeIndex: number;
  error: boolean;
  /** Id sent, never the text. */
  picked: AniMedia | null;
  preference: AniTitleLanguage | null;
  handleKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  handlePick: (brief: AniMedia) => void;
  handleClear: () => void;
  resetHighlight: () => void;
}

export function useAnimeMentionComposer(
  draft: string,
  onDraftChange: (value: string) => void,
  onUnhandled: (event: ReactKeyboardEvent<HTMLInputElement>) => void
): AnimeMentionComposer {
  const queryClient = useQueryClient();
  const preference = useAnimeTitlePreference();
  const trigger = useMemo<AnimeMentionTrigger | null>(
    () => animeMentionTrigger(draft),
    [draft]
  );
  const search = useAnimeInlineSearch(
    trigger?.query ?? "",
    trigger !== null && trigger.query.length > 0
  );
  const options = search.options;
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<AniMedia | null>(null);
  const open = trigger !== null && options.length > 0;
  const activeIndex = options.length > 0 ? Math.min(index, options.length - 1) : 0;

  useEffect(() => {
    if (draft === "") setPicked(null);
  }, [draft]);

  const pick = (brief: AniMedia) => {
    if (trigger === null) return;
    const title =
      resolveAnimeTitle(animeTitleFields(brief), preference) || brief.title;
    primeAnimeBrief(queryClient, brief);
    onDraftChange(replaceAnimeMention(draft, trigger, title));
    setPicked(brief);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      onUnhandled(event);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIndex((activeIndex + 1) % options.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setIndex((activeIndex - 1 + options.length) % options.length);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const brief = options[activeIndex];
      if (brief) pick(brief);
      return;
    }
    onUnhandled(event);
  };

  return {
    activeIndex,
    error: search.error,
    handleClear: () => setPicked(null),
    handleKeyDown,
    handlePick: pick,
    open,
    options,
    picked,
    preference,
    resetHighlight: () => setIndex(0),
  };
}
