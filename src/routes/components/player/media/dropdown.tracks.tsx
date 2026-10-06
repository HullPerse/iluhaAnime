import { cn } from "cn";
import { Check, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type TrackOption = { id: number; main: string; language: string };

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
  const currentTitle = current
    ? current.language
      ? `${current.main} - ${current.language}`
      : current.main
    : "";

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
        className="windows95-font windows95-border flex h-5 max-w-24 min-w-18 items-center gap-1 bg-white px-1 text-[10px] outline-none hover:cursor-pointer focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-dotted"
        aria-haspopup="listbox"
        aria-expanded={open}
        title={currentTitle}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="truncate">
          {label}: {current?.main ?? ""}
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
          {noneLabel ? (
            <button
              type="button"
              role="option"
              aria-selected={selectedId === null}
              className={cn(
                "text-text hover:text-primary hover:bg-secondary flex w-full items-center gap-1 bg-white px-1 py-0.5 text-left text-[10px] hover:cursor-pointer",
                selectedId === null && "bg-secondary text-primary"
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
                  "text-text hover:text-primary hover:bg-secondary flex w-full items-center gap-1 bg-white px-1 py-0.5 text-left text-[10px] hover:cursor-pointer",
                  selected && "bg-secondary text-primary"
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
                <span className="min-w-0 flex-1 truncate">{track.main}</span>
                {track.language ? (
                  <span className="shrink-0 opacity-70">{track.language}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export default TrackDropdown;
