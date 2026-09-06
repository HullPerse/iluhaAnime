import { ArrowLeft, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { PaginationProps } from "@/types";

export default function Pagination({
  total,
  page,
  lastPage,
  from,
  to,
  onPageChange,
  statusText,
  scrollRef,
}: PaginationProps) {
  const { t } = useI18n();

  const handlePageChange = (next: number) => {
    onPageChange(next);
    scrollRef?.current?.scrollTo?.(0, 0);
  };

  return (
    <section
      className="windows95-border bg-primary flex flex-row items-center justify-between px-1 py-0.5"
      role="navigation"
      aria-label={t("common.pagination.nav")}
    >
      <span className="windows95-text">{statusText}</span>
      <span className="windows95-text">
        {total > 0 && t("common.pagination.shown", { from, to, total })}
      </span>
      <div className="windows95-text flex flex-row items-center gap-1">
        <Button
          size="icon"
          className="h-6 w-6"
          onClick={() => handlePageChange(page - 1)}
          disabled={page === 1}
          aria-label={t("common.pagination.prev")}
        >
          <ArrowLeft />
        </Button>
        <Input
          key={page}
          defaultValue={String(page)}
          onChange={(e) => {
            const num = Number(e.target.value);
            if (Number.isFinite(num) && num >= 1) {
              handlePageChange(Math.min(num, lastPage));
            }
          }}
          min={1}
          max={lastPage}
          type="number"
          inputMode="numeric"
          aria-label={t("common.pagination.page", { page, lastPage })}
          aria-current="page"
          className="windows95-text windows95-border flex h-6 w-10 items-center justify-center text-center font-bold"
        />
        <Button
          size="icon"
          className="h-6 w-6"
          onClick={() => handlePageChange(page + 1)}
          disabled={page === lastPage}
          aria-label={t("common.pagination.next")}
        >
          <ArrowRight />
        </Button>
      </div>
    </section>
  );
}
