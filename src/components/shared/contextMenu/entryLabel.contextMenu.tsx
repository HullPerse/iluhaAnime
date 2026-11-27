import { ChevronRight } from "lucide-react";
import type { ComponentType } from "react";

export function EntryLabel({
  icon: Icon,
  color,
  text,
  hint,
  checked,
  chevron,
}: {
  icon?: ComponentType<{ className?: string }>;
  color?: string;
  text: string;
  hint?: string;
  checked?: boolean;
  chevron?: boolean;
}) {
  return (
    <>
      <span className="flex size-3.5 shrink-0 items-center justify-center" aria-hidden="true">
        {checked === true && <span className="size-1.5 bg-current" />}
      </span>
      {color ? (
        <span
          aria-hidden="true"
          className="windows95-border inline-block size-2.5 shrink-0"
          style={{ backgroundColor: color }}
        />
      ) : Icon ? (
        <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      ) : null}
      <span className="truncate">{text}</span>
      {hint && <span className="text-hint ml-auto pl-4 text-xs">{hint}</span>}
      {chevron === true && <ChevronRight className="ml-auto size-3.5 shrink-0" />}
    </>
  );
}
