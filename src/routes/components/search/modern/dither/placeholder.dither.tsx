import { cn } from "cn";

import { SmallLoader } from "@/components/shared/loader.component";

export function DitherUploadPlaceholder({
  fileName,
  ariaLabel,
  className,
}: {
  fileName: string;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-secondary bg-win-highlight flex aspect-video h-22 flex-col items-center justify-center gap-1 border-2 p-1",
        className
      )}
      title={fileName}
      aria-busy="true"
      aria-label={ariaLabel}
    >
      <SmallLoader />
      <span className="windows95-text text-hint line-clamp-1 w-full truncate text-center text-xs">
        {fileName}
      </span>
    </div>
  );
}
