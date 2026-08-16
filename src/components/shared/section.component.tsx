import { ChevronDown, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { useId } from "react";

import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/index.utils";

function Section({
  header,
  children,
  className,
  onExpand,
  expanded = false,
  files,
}: {
  header: string;
  children: ReactNode;
  className?: string;
  onExpand?: () => void;
  expanded?: boolean;
  files?: number;
}) {
  const contentId = useId();
  const { t } = useI18n();

  return (
    <section className="windows95-border" aria-label={header}>
      <header className="bg-secondary windows95-text flex w-full flex-row items-center justify-between px-1 py-0.5 font-bold text-white">
        <span>
          {header} {onExpand && files ? `[${files}]` : null}
        </span>

        {onExpand && (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={contentId}
            aria-label={expanded ? t("common.collapse") : t("common.expand")}
            className="windows95-text bg-secondary hover:bg-muted flex size-5 cursor-pointer items-center justify-center gap-1 px-0.5 py-0.5 text-center text-white select-none"
            onClick={onExpand}
          >
            {expanded ? (
              <ChevronDown className="size-3" />
            ) : (
              <ChevronRight className="size-3" />
            )}
          </button>
        )}
      </header>

      <div
        id={contentId}
        hidden={onExpand && !expanded}
        className={cn("p-2", className)}
      >
        {children}
      </div>
    </section>
  );
}

export default Section;
