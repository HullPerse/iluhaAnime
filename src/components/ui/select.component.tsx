import { useState, useMemo, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/index.utils";
import { Input } from "./input.component";
import { Select as BaseSelect } from "@base-ui/react/select";

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
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly { value: string; label: string }[];
  className?: string;
  placeholder?: string;
  arrow?: boolean;
  disabled?: boolean;
  searchable?: boolean;
  indexed?: boolean;
}) {
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const showSearch = searchable ?? options.length > 8;

  const filteredOptions = useMemo(() => {
    if (!showSearch || !search) return options;
    const q = search.toLowerCase();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
    );
  }, [options, search, showSearch]);

  useEffect(() => {
    if (!search) return;
    setSearch("");
  }, [value]);

  return (
    <BaseSelect.Root
      value={value}
      onValueChange={(v) => onChange(v ?? "")}
      disabled={disabled}
    >
      <BaseSelect.Trigger
        className={cn(
          "flex flex-row items-center w-full h-6 px-1 windows95-border bg-white text-text windows95-text",
          disabled ? "opacity-50 cursor-default" : "cursor-pointer",
          className,
        )}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="flex-1 text-left truncate">
          {options.find((o) => o.value === value)?.label ?? placeholder ?? ""}
        </span>
        {arrow && (
          <BaseSelect.Icon className="shrink-0 flex items-center justify-center h-4 w-4 windows95-active-border bg-primary ml-1">
            <ChevronDown className="size-2.5" />
          </BaseSelect.Icon>
        )}
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner
          className="z-50"
          sideOffset={4}
          alignItemWithTrigger
          onPointerDown={(e) => e.stopPropagation()}
        >
          <BaseSelect.Popup
            className="windows95-active-border bg-white w-full flex flex-col origin-(--transform-origin)"
            style={{ width: "var(--anchor-width)" }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {showSearch && (
              <Input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => {
                  e.stopPropagation();
                  setSearch(e.target.value);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className="flex-1 min-h-6 h-6 max-h-6 windows95-text bg-surface outline-none"
                placeholder="Поиск..."
              />
            )}
            <BaseSelect.List className="overflow-y-auto flex-1 max-h-60">
              {filteredOptions.map((o, i) => (
                <BaseSelect.Item
                  key={o.value}
                  value={o.value}
                  className="px-1 py-0.5 windows95-text windows95-border cursor-pointer truncate data-highlighted:bg-highlight data-highlighted:text-white text-text"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  <BaseSelect.ItemText>
                    {indexed ? `${i + 1}. ${o.label}` : o.label}
                  </BaseSelect.ItemText>
                </BaseSelect.Item>
              ))}
              {filteredOptions.length === 0 && (
                <div className="px-1 py-0.5 windows95-text text-text/50">
                  Нет результатов
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
