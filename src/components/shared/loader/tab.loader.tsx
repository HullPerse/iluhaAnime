import { cn } from "cn";
import type { ReactNode } from "react";

import { SmallLoader } from "@/components/shared/loader/small.loader";

export function TabLoader({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <div
      className={cn(
        "bg-surface text-secondary flex h-full min-h-40 w-full flex-col items-center justify-center gap-2",
        className
      )}
      aria-busy="true"
    >
      <SmallLoader size={6} />
      {children}
    </div>
  );
}
