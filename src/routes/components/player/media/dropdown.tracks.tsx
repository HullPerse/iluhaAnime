import { cn } from "cn";
import { Check, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useResolvedHotkeys } from "@/hooks/hotkeys.hook";
import type { ResolvedHotkeyDef } from "@/types/hotkeys";
import type { DropdownOption } from "@/types/dropdown.tracks";

const CLOSE_DEFS: ResolvedHotkeyDef<"close">[] = [
  { id: "close", chord: "Escape", repeat: "once", keybindId: "menu.close" },
];

/**
 * One player control that opens a list above itself. Audio, subtitle, streaming
 * voice-over and streaming quality all render through it, which is why the
 * values are opaque strings: the caller owns their meaning.
 */
function TrackDropdown({
  label,
  options,
  value,
  noneLabel,
  allowNone = false,
  addLabel,
  onSelect,
  onAdd,
  onOptionHover,
  disabled = false,
  className,
}: {
  label: string;
  options: DropdownOption[];
  value: string | null;
  /** Shown for the empty value, and as a selectable row when `allowNone`. */
  noneLabel?: string;
  allowNone?: boolean;
  addLabel?: string;
  onSelect: (value: string | "no") => void;
  onAdd?: () => void;
  /** Starts loading an option before it is clicked. */
  onOptionHover?: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((option) => option.value === value);
  const currentTitle = current
    ? [current.main, current.hint].filter(Boolean).join(" - ")
    : (noneLabel ?? "");
  const noneSelected = value === null;

  useResolvedHotkeys(CLOSE_DEFS, {
    enabled: open,
    onAction: () => setOpen(false),
  });

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  return (
    <div ref={ref} className={cn("relative flex items-center gap-0.5", className)}>
      <button
        type="button"
        className={cn(
          "windows95-font windows95-border text-text bg-field flex h-5 max-w-24 min-w-18 items-center gap-1 px-1 text-[10px] outline-none hover:cursor-pointer focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-dotted",
          disabled && "cursor-default opacity-50"
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${current?.main ?? noneLabel ?? ""}`}
        disabled={disabled}
        title={currentTitle}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="truncate">
          {label}: {current?.main ?? noneLabel ?? ""}
        </span>
      </button>
      {onAdd ? (
        <button
          type="button"
          className="windows95-active-border bg-primary text-text flex size-4 shrink-0 cursor-pointer items-center justify-center hover:brightness-110 active:translate-x-px active:translate-y-px"
          title={addLabel}
          aria-label={addLabel}
          onClick={onAdd}
        >
          <Plus className="size-2.5" />
        </button>
      ) : null}
      {open ? (
        <div
          className="windows95-border bg-primary absolute bottom-full left-0 z-50 mb-0.5 flex max-w-80 min-w-56 flex-col"
          role="listbox"
        >
          {noneLabel && allowNone ? (
            <button
              type="button"
              role="option"
              aria-selected={noneSelected}
              className={cn(
                "text-text hover:text-primary hover:bg-secondary bg-field flex w-full items-center gap-1 px-1 py-0.5 text-left text-[10px] hover:cursor-pointer",
                noneSelected && "bg-secondary text-primary"
              )}
              onClick={() => {
                onSelect("no");
                setOpen(false);
              }}
            >
              <span className="size-3 shrink-0" />
              <span className="truncate">{noneLabel}</span>
            </button>
          ) : null}
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                className={cn(
                  "text-text hover:text-primary hover:bg-secondary bg-field flex w-full items-center gap-1 px-1 py-0.5 text-left text-[10px] hover:cursor-pointer",
                  selected && "bg-secondary text-primary"
                )}
                onPointerEnter={() => onOptionHover?.(option.value)}
                onFocus={() => onOptionHover?.(option.value)}
                onClick={() => {
                  onSelect(option.value);
                  setOpen(false);
                }}
              >
                {selected ? (
                  <Check className="size-3 shrink-0" />
                ) : (
                  <span className="size-3 shrink-0" />
                )}
                <span className="min-w-0 flex-1 truncate">{option.main}</span>
                {option.hint ? <span className="shrink-0 opacity-70">{option.hint}</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export default TrackDropdown;
