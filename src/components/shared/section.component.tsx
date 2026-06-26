import { ReactNode } from "react";
import { cn } from "@/lib/index.utils";

function Section({ header, children, className }: { header: string; children: ReactNode; className?: string }) {
  return (
    <div className="windows95-border">
      <div className="bg-secondary text-white windows95-font font-bold text-[10px] px-1 py-0.5">
        {header}
      </div>
      <div className={cn("p-1", className)}>
        {children}
      </div>
    </div>
  );
}

export default Section;
