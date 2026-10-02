import { cn } from "cn";
import { Check, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type TrackOption = { id: number; label: string };

function TrackDropdown({
  label,
  tracks,
  selectedId,
  noneLabel,
  addLabel,
  onSelect,
  onAdd,
  className,
}: {
  label: string;
  tracks: TrackOption[];
  selectedId: number | null;
  noneLabel?: string;
  addLabel?: string;
  onSelect: (id: number | "no") => void;
  onAdd?: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = tracks.find((track) => track.id === selectedId);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn("relative flex items-center gap-0.5", className)}>
      <button
        type="button"
        className="windows95-font windows95-border flex h-5 max-w-24 min-w-18 items-center gap-1 bg-white px-1 text-[10px] outline-none hover:cursor-pointer focus-visible:outline-1 focus-visible:outline-dotted focus-visible:outline-offset-[-3px]"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="truncate">{label}: {current?.label ?? ""}</span>
      </button>
      {onAdd ? (
        <button
          type="button"
          className="windows95-active-border flex size-4 shrink-0 cursor-pointer items-center justify-center bg-primary text-text hover:brightness-110 active:translate-x-px active:translate-y-px"
          title={addLabel}
          aria-label={addLabel}
          onClick={onAdd}
        >
          <Plus className="size-2.5" />
        </button>
      ) : null}
      {open ? (
        <div
          className="windows95-border absolute bottom-full left-0 z-50 mb-0.5 flex min-w-24 flex-col bg-primary"
          role="listbox"
        >
          {noneLabel ? (
            <button
              type="button"
              role="option"
              aria-selected={selectedId === null}
              className={cn(
                "text-text hover:text-primary flex w-full items-center gap-1 bg-white px-1 py-0.5 text-left text-[10px] hover:cursor-pointer hover:bg-secondary",
                selectedId === null && "bg-secondary text-primary",
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
          {tracks.map((track) => {
            const selected = track.id === selectedId;
            return (
              <button
                key={track.id}
                type="button"
                role="option"
                aria-selected={selected}
                className={cn(
                  "text-text hover:text-primary flex w-full items-center gap-1 bg-white px-1 py-0.5 text-left text-[10px] hover:cursor-pointer hover:bg-secondary",
                  selected && "bg-secondary text-primary",
                )}
                onClick={() => {
                  onSelect(track.id);
                  setOpen(false);
                }}
              >
                {selected ? (
                  <Check className="size-3 shrink-0" />
                ) : (
                  <span className="size-3 shrink-0" />
                )}
                <span className="max-w-48 truncate">{track.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export default TrackDropdown;