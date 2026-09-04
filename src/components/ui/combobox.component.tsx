import { Combobox as BaseCombobox } from "@base-ui/react/combobox";
import { ChevronDown } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/index.utils";

import { Input } from "./input.component";

interface ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: readonly {
    value: string;
    label: string;
    style?: React.CSSProperties;
  }[];
  className?: string;
  placeholder?: string;
  arrow?: boolean;
  disabled?: boolean;
  indexed?: boolean;
}

export default function Combobox({
  value,
  onChange,
  options,
  className = "",
  placeholder,
  arrow = true,
  disabled,
  indexed = false,
}: ComboboxProps) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const selectedOption = options.find((option) => option.value === value);
  const filteredOptions = useMemo(() => {
    const query = search.toLowerCase();

    if (!query) return options;

    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(query) || option.value.toLowerCase().includes(query)
    );
  }, [options, search]);

  return (
    <BaseCombobox.Root
      value={value}
      onOpenChange={(open) => {
        if (!open) setSearch("");
        else requestAnimationFrame(() => searchInputRef.current?.focus());
      }}
      onValueChange={(next) => {
        if (next === null) return;
        setSearch("");
        onChange(next);
      }}
      disabled={disabled}
    >
      <BaseCombobox.Trigger
        className={cn(
          "windows95-border text-text windows95-text flex min-h-(--ui-control-height) w-full flex-row items-center bg-white px-1",
          disabled ? "cursor-default opacity-50" : "cursor-pointer",
          className
        )}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="flex-1 truncate text-left" style={selectedOption?.style}>
          {selectedOption?.label ?? placeholder ?? ""}
        </span>
        {arrow && (
          <BaseCombobox.Icon className="windows95-active-border bg-primary ml-1 flex h-4 w-4 shrink-0 items-center justify-center">
            <ChevronDown className="size-2.5" />
          </BaseCombobox.Icon>
        )}
      </BaseCombobox.Trigger>
      <BaseCombobox.Portal>
        <BaseCombobox.Positioner
          className="z-50"
          side="bottom"
          align="start"
          sideOffset={4}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <BaseCombobox.Popup className="windows95-active-border flex max-h-[min(12rem,var(--available-height))] w-(--anchor-width) max-w-(--available-width) origin-(--transform-origin) flex-col overflow-hidden bg-white">
            <Input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => {
                e.stopPropagation();
                setSearch(e.target.value);
              }}
              onKeyDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              autoFocus
              className="windows95-text bg-surface border-muted h-6 min-h-6 w-full shrink-0 border-b outline-none"
              placeholder={t("common.search")}
            />
            <BaseCombobox.List className="max-h-48 flex-1 overflow-y-auto overscroll-contain py-1 outline-0">
              {filteredOptions.map((option, index) => (
                <BaseCombobox.Item
                  key={option.value}
                  value={option.value}
                  className="windows95-text windows95-border data-highlighted:bg-highlight text-text cursor-pointer truncate px-1 py-0.5 data-highlighted:text-white"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                >
                  {indexed ? `${index + 1}. ${option.label}` : option.label}
                </BaseCombobox.Item>
              ))}
              {filteredOptions.length === 0 && (
                <div className="windows95-text text-text/50 px-1 py-0.5">
                  {t("common.no.results")}
                </div>
              )}
            </BaseCombobox.List>
          </BaseCombobox.Popup>
        </BaseCombobox.Positioner>
      </BaseCombobox.Portal>
    </BaseCombobox.Root>
  );
}
