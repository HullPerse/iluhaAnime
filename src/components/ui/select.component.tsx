import { Select as BaseSelect } from "@base-ui/react/select";
import { cn } from "cn";
import { Check, ChevronDown } from "lucide-react";
import { createContext, useContext, useEffect, useState, useMemo, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import { useI18n } from "@/hooks/i18n.hook";
import { scheduleTask } from "@hullperse/hp_utils/shared";
import type { SelectProps } from "@/types/core/ui";

import { Input } from "@/components/ui/input.component";

export const SelectPortalContainerContext = createContext<HTMLElement | null>(null);

function Select<T extends string = string>({
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
}: SelectProps<T>) {
  const { t } = useI18n();
  const [search, setSearch] = useState<string>("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const portalContainer = useContext(SelectPortalContainerContext);

  const showSearch = searchable ?? options.length > 8;
  const selectedOption = useMemo(
    () => options.find((option) => option.value === value),
    [options, value]
  );

  const items = useMemo(() => options.map(({ label, value }) => ({ label, value })), [options]);
  const filteredOptions = useMemo(() => {
    if (!showSearch || !search) return options;
    const q = search.toLowerCase();
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)
    );
  }, [options, search, showSearch]);

  const scrollToSelected = () => {
    const list = listRef.current;
    const item = list?.querySelector<HTMLElement>("[data-selected]");
    if (!list || !item) return;
    const listRect = list.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    list.scrollTop += itemRect.top - listRect.top - (listRect.height - itemRect.height) / 2;
  };

  useEffect(() => {
    if (!search) return;
    const task = scheduleTask("raf", 0, () => {
      if (listRef.current) listRef.current.scrollTop = 0;
    });
    return () => task.cancel();
  }, [search]);

  const scheduleScrollToSelected = () => {
    scheduleTask("raf", 0, () => {
      if (showSearch) searchInputRef.current?.focus();
      scrollToSelected();
    });
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setSearch("");
      return;
    }
    scheduleScrollToSelected();
  };

  const handleSearchKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      searchInputRef.current?.blur();
      listRef.current?.focus();
      return;
    }
    e.stopPropagation();
  };

  return (
    <BaseSelect.Root
      items={items}
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
          "windows95-border text-text windows95-text bg-field flex min-h-(--ui-control-height) w-full flex-row items-center px-1",
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
      <BaseSelect.Portal container={portalContainer ?? undefined}>
        <BaseSelect.Positioner
          className="z-50"
          side="bottom"
          align="start"
          sideOffset={4}
          alignItemWithTrigger={false}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Escape") e.preventDefault();
          }}
        >
          <BaseSelect.Popup className="windows95-active-border bg-field flex max-h-[min(12rem,var(--available-height))] w-(--anchor-width) max-w-(--available-width) origin-(--transform-origin) flex-col overflow-hidden">
            {showSearch && (
              <Input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => {
                  e.stopPropagation();
                  setSearch(e.target.value);
                }}
                onKeyDown={handleSearchKeyDown}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                autoFocus
                className="windows95-text bg-surface border-muted h-6 min-h-6 w-full shrink-0 border-b outline-none"
                placeholder={t("common.search")}
              />
            )}
            <BaseSelect.List
              ref={listRef}
              tabIndex={-1}
              className="max-h-48 flex-1 overflow-y-auto overscroll-contain scroll-auto outline-0 [overflow-anchor:none]"
            >
              {filteredOptions.map((o, i) => (
                <BaseSelect.Item
                  key={o.value}
                  value={o.value}
                  className="windows95-text windows95-border text-text data-highlighted:bg-highlight data-selected:bg-primary/70 data-highlighted:not-data-selected:text-title-text flex cursor-pointer items-center gap-1 px-1 py-0.5 data-selected:font-bold"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  <span aria-hidden className="flex w-2.5 shrink-0 justify-center">
                    {o.value === value && <Check className="size-2.5" />}
                  </span>
                  <BaseSelect.ItemText className="min-w-0 flex-1 truncate" style={o.style}>
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
