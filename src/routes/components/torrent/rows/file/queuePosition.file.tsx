import { useI18n } from "@/hooks/i18n.hook";

export function QueuePosition({ position }: { position?: number }) {
  const { t } = useI18n();
  if (position === undefined) return null;
  return (
    <span
      className="text-hint shrink-0 tabular-nums"
      title={t("torrent.queue.position", { position })}
      data-testid="torrent-file-queue-position"
    >
      {position}.
    </span>
  );
}
