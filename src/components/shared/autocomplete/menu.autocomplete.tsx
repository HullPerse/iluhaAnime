import { cn } from "cn";

import { useI18n } from "@/lib/locale/i18n.utils";
import type { SearchSuggestion } from "@/lib/search/suggestions.utils";
import type { SuggestionSection } from "@/types/search";

import { suggestionKindLabels } from "./look.autocomplete";
import { SuggestionItem } from "./suggestion.autocomplete";

export function SuggestionMenu({
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
