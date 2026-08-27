import { ArrowLeft, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import { useI18n } from "@/lib/i18n";
import type { PaginationProps } from "@/types";

export default function Pagination({
  total,
  page,
  lastPage,
  from,
  to,
  onPageChange,
  statusText,
}: PaginationProps) {
  const { t } = useI18n();

  return (
    <section className="windows95-border bg-primary flex flex-row items-center justify-between px-1 py-0.5">
      <span className="windows95-text">{statusText}</span>
      <span className="windows95-text">
        {total > 0 && t("common.paginationShown", { from, to, total })}
      </span>
      <div className="windows95-text flex flex-row items-center gap-1">
        <Button
          size="icon"
          className="h-6 w-6"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
        >
          <ArrowLeft />
        </Button>
        <Input
          key={page}
          defaultValue={String(page)}
          onChange={(e) => {
            const num = Number(e.target.value);
            if (Number.isFinite(num) && num >= 1) {
              onPageChange(Math.min(num, lastPage));
            }
          }}
          min={1}
          max={lastPage}
          type="number"
          inputMode="numeric"
          className="windows95-text windows95-border flex h-6 w-10 items-center justify-center text-center font-bold"
        />
        <Button
          size="icon"
          className="h-6 w-6"
          onClick={() => onPageChange(page + 1)}
          disabled={page === lastPage}
        >
          <ArrowRight />
        </Button>
      </div>
    </section>
  );
}
