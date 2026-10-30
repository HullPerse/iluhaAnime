import { memo } from "react";

import { useI18n } from "@/hooks/i18n.hook";

import { SpellCorrectionRow } from "@/components/shared/autocomplete/spellCorrectionRow.autocomplete";

const PANEL_PLACEMENT: Record<"above" | "below", string> = {
  above:
    "windows95-border bg-primary windows95-text absolute right-0 bottom-full left-0 z-50 mb-0.5 flex flex-col px-1 py-0.5 text-xs",
  below:
    "windows95-border bg-primary windows95-text absolute top-full right-0 left-0 z-50 mt-0.5 flex flex-col px-1 py-0.5 text-xs",
};

export const SpellCorrectionsPanel = memo(
  ({
    corrections,
    query,
    onApplyAt,
    onSave,
    placement,
  }: {
    corrections: string[];
    query: string;
    onApplyAt?: (correction: string) => void;
    onSave?: () => void;
    placement: "below" | "above";
  }) => {
    const { t } = useI18n();
    if (corrections.length === 0) return null;
    return (
      <div
        role="tooltip"
        onMouseDown={(event) => event.preventDefault()}
        className={PANEL_PLACEMENT[placement]}
      >
        {corrections.map((correction) => (
          <SpellCorrectionRow
            key={correction}
            correction={correction}
            query={query}
            onApply={onApplyAt}
          />
        ))}
        <div className="flex items-center gap-1 pt-0.5">
          <button
            type="button"
            title={t("search.spell.save.word.title")}
            aria-label={t("search.spell.save.word.title")}
            onClick={onSave}
            className="windows95-small-border bg-primary windows95-text hover:bg-surface shrink-0 px-1 py-px font-bold active:translate-x-px active:translate-y-px"
          >
            {t("search.spell.save.word")}
          </button>
          <kbd
            aria-hidden="true"
            title={t("search.spell.save.word.title")}
            className="windows95-small-border bg-field windows95-text shrink-0 px-1 py-px font-bold"
          >
            Ctrl+Tab
          </kbd>
          <span aria-hidden="true" className="text-hint min-w-0 flex-1 truncate">
            {t("search.spell.apply.title")}
          </span>
        </div>
      </div>
    );
  }
);
