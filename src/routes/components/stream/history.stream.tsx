import { Trash2 } from "lucide-react";

import { streamApi } from "@/api/stream.api";
import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { useStreamHistoryRecent } from "@/hooks/stream/catalog.hook";

import { HistoryRow } from "@/routes/components/stream/historyRow.stream";

/**
 * The history modal: the last remembered episodes, newest first, read from the
 * local database. It opens a title through its slug, the same path a deep link
 * takes, so a row is one click away from the episode list.
 */
export default function StreamHistoryModal({
  open,
  onClose,
  onOpen,
}: {
  open: boolean;
  onClose: () => void;
  onOpen: (slug: string) => void;
}) {
  const { t } = useI18n();
  const query = useStreamHistoryRecent(open);
  if (!open) return null;

  const rows = query.data ?? [];
  const clear = () => {
    streamApi
      .historyClear()
      .then(() => query.refetch())
      .catch(() => undefined);
  };

  return (
    <Modal
      header={t("stream.history.title")}
      onClose={onClose}
      className="w-180 max-w-[94%]"
      headerActions={
        rows.length > 0 ? (
          <Button
            size="icon"
            title={t("stream.history.clear")}
            aria-label={t("stream.history.clear")}
            onClick={clear}
          >
            <Trash2 className="size-2.5" />
          </Button>
        ) : null
      }
    >
      {query.isPending ? (
        <div className="windows95-border bg-field h-40" aria-busy="true" />
      ) : rows.length === 0 ? (
        <p className="text-hint windows95-text p-3 text-center">{t("stream.history.empty")}</p>
      ) : (
        <div
          role="list"
          className="windows95-border bg-field flex max-h-100 min-h-0 flex-col overflow-y-auto p-0.5"
        >
          {rows.map((entry) => (
            <HistoryRow
              key={`${entry.animeId}:${entry.episodeId}`}
              entry={entry}
              onOpen={() => onOpen(entry.slug)}
            />
          ))}
        </div>
      )}
    </Modal>
  );
}
