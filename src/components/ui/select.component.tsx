import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/index.utils";
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
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const selected = options.find((o) => o.value === value);

  const showSearch = searchable ?? options.length > 8;

  const filteredOptions = useMemo(() => {
    if (!showSearch || !search) return options;
    const q = search.toLowerCase();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
    );
  }, [options, search, showSearch]);

  useLayoutEffect(() => {
    if (!open) {
      setSearch("");
      setStyle({});
      return;
    }

    const position = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const gap = 4;
      const spaceBelow = window.innerHeight - rect.bottom - gap;
      const spaceAbove = rect.top - gap;
      const preferBelow = spaceBelow >= 100 || spaceBelow >= spaceAbove;
      const maxHeight = Math.max(
        60,
        Math.min(preferBelow ? spaceBelow : spaceAbove, 300),
      );
      const top = preferBelow ? rect.bottom + gap : rect.top - gap - maxHeight;
      const availableWidth = window.innerWidth - gap * 2;
      const width = Math.min(Math.max(rect.width, 60), availableWidth);
      const left = Math.max(
        gap,
        Math.min(rect.left, window.innerWidth - width - gap),
      );

      setStyle({
        position: "fixed",
        top,
        left,
        width,
        maxHeight,
        zIndex: 9999,
      });
    };

    position();
    window.addEventListener("scroll", position, true);
    window.addEventListener("resize", position);
    return () => {
      window.removeEventListener("scroll", position, true);
      window.removeEventListener("resize", position);
    };
  }, [open]);

  useEffect(() => {
    if (!open || disabled) return;

    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };

    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    window.addEventListener("mousedown", handler);
    window.addEventListener("keydown", keyHandler);
    return () => {
      window.removeEventListener("mousedown", handler);
      window.removeEventListener("keydown", keyHandler);
    };
  }, [open, disabled]);

  useEffect(() => {
    if (open && showSearch && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [open, showSearch]);

  const handleSelect = useCallback(
    (v: string) => {
      onChange(v);
      setOpen(false);
    },
    [onChange],
  );

  return (
    <div ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        className={cn(
          "flex flex-row items-center w-full h-6 px-1 windows95-border bg-white text-text windows95-text",
          disabled ? "opacity-50 cursor-default" : "cursor-pointer",
          className,
        )}
        onClick={() => !disabled && setOpen((p) => !p)}
      >
        <span className="flex-1 text-left truncate">
          {selected?.label ?? placeholder ?? ""}
        </span>
        {arrow && (
          <span className="shrink-0 flex items-center justify-center h-4 w-4 windows95-active-border bg-primary ml-1">
            <ChevronDown className="size-2.5" />
          </span>
        )}
      </button>
      {open &&
        !disabled &&
        createPortal(
          <div
            ref={dropdownRef}
            className="windows95-active-border bg-white min-w-20 w-fit max-w-xl flex flex-col"
            style={style}
          >
            {showSearch && (
              <Input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
                className="flex-1 min-h-6 h-6 max-h-6 windows95-text bg-surface outline-none"
                placeholder="Поиск..."
              />
            )}
            <ul className="overflow-y-auto flex-1">
              {filteredOptions.map((o, i) => (
                <li
                  key={o.value}
                  className={`px-1 py-0.5 windows95-text windows95-border cursor-pointer truncate ${o.value === value ? "bg-highlight text-white" : "text-text hover:bg-surface"}`}
                  onClick={() => handleSelect(o.value)}
                >
                  {indexed ? `${i + 1}. ${o.label}` : o.label}
                </li>
              ))}
              {filteredOptions.length === 0 && (
                <li className="px-1 py-0.5 windows95-text text-text/50">
                  Нет результатов
                </li>
              )}
            </ul>
          </div>,

          document.body,
        )}
    </div>
  );
}

export default Select;
