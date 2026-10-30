import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { monthLabel } from "@/lib/core/activity.utils";

export function CalendarHeader({
  month,
  year,
  onPrev,
  onNext,
}: {
  month: number;
  year: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const { t, locale } = useI18n();
  return (
    <div className="mb-1 flex h-6 items-center justify-between px-1">
      <Button onClick={onPrev} size="icon" className="size-6" aria-label={t("common.previous")}>
        <ChevronLeft className="size-3" />
      </Button>
      <span className="windows95-text text-xs font-bold">
        {monthLabel(month, locale, "long")} {year}
      </span>
      <Button onClick={onNext} size="icon" className="size-6" aria-label={t("common.next")}>
        <ChevronRight className="size-3" />
      </Button>
    </div>
  );
}
