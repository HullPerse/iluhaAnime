import { cn } from "cn";
import { X } from "lucide-react";

import { useI18n } from "@/lib/locale/i18n.utils";
import { splitHighlighted } from "@/lib/search/highlight.utils";
import type { SearchSuggestion } from "@/lib/search/suggestions.utils";

import { suggestionIcons, suggestionKindLabels } from "./look.autocomplete";

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

export function SuggestionItem({
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
