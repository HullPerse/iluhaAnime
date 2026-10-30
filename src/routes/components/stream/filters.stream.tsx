import Modal from "@/components/shared/modal.component";
import { useI18n } from "@/hooks/i18n.hook";
import type { StreamCatalogFilters } from "@/types/player/stream";

import { FiltersContent } from "@/routes/components/stream/filters/content.filters";

export default function StreamFiltersModal({
  open,
  filters,
  onApply,
  onClose,
}: {
  open: boolean;
  filters: StreamCatalogFilters;
  onApply: (filters: StreamCatalogFilters) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  if (!open) return null;
  return (
    <Modal header={t("stream.filters.title")} onClose={onClose} className="w-xl">
      <FiltersContent initial={filters} onApply={onApply} onClose={onClose} />
    </Modal>
  );
}
