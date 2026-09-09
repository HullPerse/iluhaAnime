import { Select as BaseSelect } from "@base-ui/react/select";
import { cn } from "cn";
import { ChevronDown } from "lucide-react";
import { useState, useMemo, useRef } from "react";

import { useI18n } from "@/lib/locale/i18n.utils";

import { Input } from "./input.component";

function Select({
  value,
  onChange,
  options,
  className = "",
  placeholder,
  arrow = true,
  disabled,
  searchable,
  indexed = false,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly {
    value: string;
    label: string;
    style?: React.CSSProperties;
  }[];
  className?: string;
  placeholder?: string;
  arrow?: boolean;
  disabled?: boolean;
  searchable?: boolean;
  indexed?: boolean;
  label?: string;
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const showSearch = searchable ?? options.length > 8;
  const selectedOption = options.find((o) => o.value === value);

  const filteredOptions = useMemo(() => {
    if (!showSearch || !search) return options;
    const q = search.toLowerCase();
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)
    );
  }, [options, search, showSearch]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setSearch("");
    else if (showSearch) requestAnimationFrame(() => searchInputRef.current?.focus());
  };

  return (
    <BaseSelect.Root
      value={value}
      onOpenChange={handleOpenChange}
      onValueChange={(v) => {
        if (v === null) return;
        setSearch("");
        onChange(v);
      }}
      disabled={disabled}
    >
      <BaseSelect.Trigger
        aria-label={label}
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
          <BaseSelect.Icon className="windows95-active-border bg-primary ml-1 flex h-4 w-4 shrink-0 items-center justify-center">
            <ChevronDown className="size-2.5" />
          </BaseSelect.Icon>
        )}
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner
          className="z-50"
          side="bottom"
          align="start"
          sideOffset={4}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <BaseSelect.Popup className="windows95-active-border flex max-h-[min(12rem,var(--available-height))] w-(--anchor-width) max-w-(--available-width) origin-(--transform-origin) flex-col overflow-hidden bg-white">
            {showSearch && (
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
            )}
            <BaseSelect.List className="max-h-48 flex-1 overflow-y-auto overscroll-contain outline-0">
              {filteredOptions.map((o, i) => (
                <BaseSelect.Item
                  key={o.value}
                  value={o.value}
                  className="windows95-text windows95-border data-highlighted:bg-highlight text-text cursor-pointer truncate px-1 py-0.5 data-highlighted:text-white"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  <BaseSelect.ItemText>
                    {indexed ? `${i + 1}. ${o.label}` : o.label}
                  </BaseSelect.ItemText>
                </BaseSelect.Item>
              ))}
              {filteredOptions.length === 0 && (
                <div className="windows95-text text-text/50 px-1 py-0.5">
                  {t("common.no.results")}
                </div>
              )}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}

export default Select;
