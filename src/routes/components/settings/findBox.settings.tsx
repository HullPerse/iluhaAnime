import type { RefObject } from "react";

import { Input } from "@/components/ui/input.component";
import { useI18n } from "@/hooks/i18n.hook";

export function FindBox({
  value,
  onChange,
  onJumpSelected,
  optionCount,
  activeIndex,
  onActiveChange,
  listId,
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  onJumpSelected: () => void;
  optionCount: number;
  activeIndex: number;
  onActiveChange: (index: number) => void;
  listId: string;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const { t } = useI18n();
  const expanded = optionCount > 0;
  const moveOption = (delta: number) => {
    if (optionCount === 0) return;
    onActiveChange(Math.min(Math.max(activeIndex + delta, 0), optionCount - 1));
  };
  return (
    <Input
      ref={inputRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onChange("");
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          onJumpSelected();
          return;
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          moveOption(1);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          moveOption(-1);
          return;
        }
        if (e.key === "Home") {
          e.preventDefault();
          if (optionCount > 0) onActiveChange(0);
          return;
        }
        if (e.key === "End") {
          e.preventDefault();
          if (optionCount > 0) onActiveChange(optionCount - 1);
        }
      }}
      role="combobox"
      aria-expanded={expanded}
      aria-controls={expanded ? listId : undefined}
      aria-activedescendant={expanded ? `${listId}-${activeIndex}` : undefined}
      aria-autocomplete="list"
      placeholder={t("settings.find.placeholder")}
      aria-label={t("settings.find.placeholder")}
      title={t("settings.find.footer.hint")}
      autoFocus
      spellCheck={false}
    />
  );
}
