import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/i18n";

export default function SearchPager({
  page,
  pageFull,
  isLoading,
  onPageChange,
}: {
  page: number;
  pageFull: boolean;
  isLoading: boolean;
  onPageChange: (page: number) => void;
}) {
  const { t } = useI18n();
  return (
    <section className="flex items-center justify-end gap-1 py-1">
      <span className="windows95-text mr-1">{t("search.page", { page })}</span>
      <Button
        size="icon"
        className="size-5"
        disabled={page <= 1 || isLoading}
        onClick={() => onPageChange(Math.max(1, page - 1))}
      >
        <ChevronLeft className="size-3" />
      </Button>
      <Button
        size="icon"
        className="size-5"
        disabled={!pageFull || isLoading}
        onClick={() => onPageChange(page + 1)}
      >
        <ChevronRight className="size-3" />
      </Button>
    </section>
  );
}
