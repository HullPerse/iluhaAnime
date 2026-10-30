import { ChevronRight } from "lucide-react";
import type { ComponentType } from "react";

export function EntryLabel({
  icon: Icon,
  text,
  hint,
  checked,
  chevron,
}: {
  icon?: ComponentType<{ className?: string }>;
  text: string;
  hint?: string;
  checked?: boolean;
  chevron?: boolean;
}) {
  return (
    <>
      <span className="flex size-3.5 shrink-0 items-center justify-center" aria-hidden="true">
        {checked === true ? <span className="size-1.5 bg-current" /> : null}
      </span>
      {Icon ? <Icon className="size-3.5 shrink-0" /> : null}
      <span className="truncate">{text}</span>
      {hint ? <span className="text-hint ml-auto pl-4 text-xs">{hint}</span> : null}
      {chevron === true ? <ChevronRight className="ml-auto size-3.5 shrink-0" /> : null}
    </>
  );
}
