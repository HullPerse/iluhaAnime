import { ReactNode } from "react";
import { cn } from "@/lib/index.utils";
import { ChevronDown, ChevronRight } from "lucide-react";

function Section({
  header,
  children,
  className,
  onExpand,
  expanded = false,
  files = 0,
}: {
  header: string;
  children: ReactNode;
  className?: string;
  onExpand?: () => void;
  expanded?: boolean;
  files?: number;
}) {
  return (
    <main className="windows95-border">
      <section className="flex flex-row w-full items-center bg-secondary text-white windows95-text font-bold px-1 py-0.5 justify-between">
        <span>
          {header} {onExpand ? `[${files}]` : null}
        </span>

        {onExpand && (
          <div
            role="button"
            className="size-5 flex gap-1 windows95-text cursor-pointer bg-secondary hover:bg-muted text-white px-0.5 py-0.5  text-center items-center justify-center select-none"
            onClick={onExpand}
          >
            {expanded ? (
              <ChevronDown className="size-3" />
            ) : (
              <ChevronRight className="size-3" />
            )}
          </div>
        )}
      </section>

      <div hidden={onExpand && !expanded} className={cn("p-1", className)}>
        {children}
      </div>
    </main>
  );
}

export default Section;
