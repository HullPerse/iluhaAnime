import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";

function TrackDropdown({
  label,
  tracks,
  selected,
  onChange,
  onAdd,
  statuses,
  isExtracting,
  extractElapsed,
  progressPercent,
}: {
  label: string;
  tracks: { index: number; label: string }[];
  selected: number;
  onChange: (index: number) => void;
  onAdd?: () => void;
  statuses?: Record<number, "idle" | "extracting" | "cached" | "copy" | undefined>;
  isExtracting?: boolean;
  extractElapsed?: number;
  progressPercent?: number;
}) {
  const [open, setOpen] = useState<boolean>(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const current = tracks.find((t) => t.index === selected);

  return (
    <div ref={ref} className="relative flex items-center gap-0.5">
      <button
        className="flex items-center gap-1 h-5 text-[10px] windows95-font windows95-border px-1 min-w-18 max-w-24 outline-none focus-visible:outline-dotted focus-visible:outline-1 focus-visible:outline-offset-[-3px] hover:cursor-pointer bg-white"
        onClick={() => setOpen(!open)}
      >
        <span className="truncate">
          {label}: {current?.label ?? ""}
        </span>
        {isExtracting && progressPercent !== undefined ? (
          <div className="flex items-center gap-1 shrink-0 ml-auto min-w-16">
            <div className="flex-1 windows95-border bg-white h-2 min-w-10">
              <div
                className="h-full bg-highlight transition-none"
                style={{ width: `${Math.round(progressPercent)}%` }}
              />
            </div>
            <span className="text-[8px] text-amber-500 shrink-0 w-6 text-right tabular-nums">
              {Math.round(progressPercent)}%
            </span>
          </div>
        ) : isExtracting ? (
          <span className="flex items-center gap-0.5 text-[8px] text-amber-500 shrink-0 ml-auto">
            <span className="inline-block size-1.5 rounded-full bg-amber-500 animate-pulse" />
            {extractElapsed !== undefined && extractElapsed >= 1
              ? `${extractElapsed}s`
              : "..."}
          </span>
        ) : null}
      </button>
      {onAdd && (
        <button
          className="flex items-center justify-center size-4 windows95-text hover:cursor-pointer windows95-border leading-none bg-white"
          onClick={onAdd}
          title={`Add ${label.toLowerCase()} track`}
        >
          +
        </button>
      )}
      {open && (
        <div className="absolute bottom-full left-0 mb-0.5 min-w-full windows95-border bg-primary z-50 max-w-mdl w-md">
          {tracks.map((t) => (
            <button
              key={t.index}
              className="flex items-center gap-1 w-full text-left px-1 py-0.5 windows95-text bg-white hover:bg-secondary hover:text-white whitespace-nowrap hover:cursor-pointer max-w-md line-clamp-1"
              onClick={() => {
                onChange(t.index);
                setOpen(false);
              }}
            >
              {t.index === selected ? (
                <Check className="size-3 shrink-0" />
              ) : (
                <span className="size-3 shrink-0" />
              )}
              <span className="truncate">{t.label}</span>
              {statuses?.[t.index] === "copy" && (
                <span className="text-[8px] text-green-600 shrink-0 ml-auto">COPY</span>
              )}
              {statuses?.[t.index] === "cached" && (
                <span className="text-[8px] text-blue-600 shrink-0 ml-auto">CACHE</span>
              )}
              {statuses?.[t.index] === "extracting" && (
                <span className="text-[8px] text-amber-500 shrink-0 ml-auto animate-pulse">LOAD</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default TrackDropdown
