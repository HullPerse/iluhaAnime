import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

function Select({
  value,
  onChange,
  options,
  className = "",
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly { value: string; label: string }[];
  className?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) {
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
      const maxHeight = Math.max(60, Math.min(preferBelow ? spaceBelow : spaceAbove, 300));
      const top = preferBelow ? rect.bottom + gap : rect.top - gap - maxHeight;
      const availableWidth = window.innerWidth - gap * 2;
      const width = Math.min(Math.max(rect.width, 60), availableWidth);
      const left = Math.max(gap, Math.min(rect.left, window.innerWidth - width - gap));

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
    if (!open) return;

    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node) &&
        listRef.current &&
        !listRef.current.contains(e.target as Node)
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
  }, [open]);

  const handleSelect = useCallback(
    (v: string) => {
      onChange(v);
      setOpen(false);
    },
    [onChange],
  );

  return (
    <div ref={containerRef} className={className}>
      <button
        type="button"
        className="flex flex-row items-center w-full h-6 px-1 windows95-border bg-white text-text windows95-text cursor-pointer"
        onClick={() => setOpen((p) => !p)}
      >
        <span className="flex-1 text-left truncate">
          {selected?.label ?? placeholder ?? ""}
        </span>
        <span className="shrink-0 flex items-center justify-center w-4 h-4 windows95-active-border bg-primary ml-1">
          <ChevronDown className="size-2.5" />
        </span>
      </button>
      {open && createPortal(
        <ul
          ref={listRef}
          className="windows95-active-border bg-white overflow-y-auto"
          style={style}
        >
          {options.map((o) => (
            <li
              key={o.value}
              className={`px-1 py-0.5 text-[11px] cursor-pointer truncate ${o.value === value ? "bg-highlight text-white" : "text-text hover:bg-highlight hover:text-white"}`}
              onClick={() => handleSelect(o.value)}
            >
              {o.label}
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </div>
  );
}

export default Select;
