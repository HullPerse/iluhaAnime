import { useState } from "react";
import { RefreshCw } from "lucide-react";

import { torrentApi } from "@/api/torrent.api";
import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { queryKeys } from "@/lib/core/keys.utils";
import { attempt } from "@/lib/core/attempt.utils";
import { showError } from "@/lib/core/notification.utils";
import { ignore } from "@/lib/core/promise.utils";
import { settingsAtoms } from "@/store/settings.store";
import { UPDATE_SOURCES_WITH_FILES, findUpdatedFiles } from "@/lib/torrent/torrentUpdate.utils";
import type {
  TorrentInfo,
  TorrentFileInfo,
  TorrentDetailFile,
  TorrentDetails,
} from "@/types/torrent/torrent";

export default function UpdateCheck({
  item,
  files,
  onUpdateRequest,
}: {
  item: TorrentInfo;
  files: TorrentFileInfo[];
  onUpdateRequest: (request: { added: TorrentDetailFile[]; details: TorrentDetails }) => void;
}) {
  const { t } = useI18n();
  const sourceQuery = useAppQuery("slow", {
    queryKey: queryKeys.torrentSource(item.id, item.info_hash),
    queryFn: () => torrentApi.getTorrentSource(item.id, item.info_hash),
  });
  const sourceData = sourceQuery.data;
  const origin = sourceData && UPDATE_SOURCES_WITH_FILES.has(sourceData.source) ? sourceData : null;
  const [checking, setChecking] = useState(false);
  const [update, setUpdate] = useState<{
    added: TorrentDetailFile[];
    details: TorrentDetails;
    replaced: boolean;
  } | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  if (origin === null) return null;

  const check = async () => {
    if (checking) return;
    setChecking(true);
    const proxy = settingsAtoms.searchProxyUrls.get()[origin.source] || undefined;
    const [details, error] = await attempt(
      torrentApi.getTorrentDetails(origin.source, origin.url, proxy)
    );
    setChecking(false);
    if (error || !details) {
      if (error) showError(t("torrent.files.update.error"), error.message);
      return;
    }
    const added = findUpdatedFiles(files, details.files);
    const replaced =
      Boolean(details.infoHash) && details.infoHash.toLowerCase() !== item.info_hash.toLowerCase();
    if (added.length === 0 && !replaced) return;
    setUpdate({ added, details, replaced });
    setPicked(new Set(added.map((file) => file.name)));
  };

  const togglePicked = (name: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const confirm = () => {
    if (!update) return;
    const added = update.added.filter((file) => picked.has(file.name));
    setUpdate(null);
    if (added.length === 0) return;
    onUpdateRequest({ added, details: update.details });
  };

  return (
    <>
      <Button
        size="icon"
        className="ml-auto size-5"
        title={t("torrent.files.check.new")}
        aria-label={t("torrent.files.check.new")}
        loading={checking}
        onClick={(event) => {
          event.stopPropagation();
          ignore(check());
        }}
      >
        <RefreshCw className="size-3" />
      </Button>
      {update && (
        <Modal
          header={t("torrent.files.update.title")}
          onClose={() => setUpdate(null)}
          className="w-xl"
        >
          <div className="flex max-h-80 flex-col gap-1 overflow-y-auto p-1">
            {update.replaced && (
              <span className="windows95-text text-xs font-bold">
                {t("torrent.files.update.replaced")}
              </span>
            )}
            <span className="windows95-text text-xs font-bold">
              {t("torrent.files.new.found", { count: update.added.length })}
            </span>
            {update.added.map((file) => (
              <label
                key={file.name}
                className="windows95-text hover:bg-surface flex w-full cursor-pointer items-center gap-1 px-1 py-0.5 select-none"
              >
                <Checkbox
                  checked={picked.has(file.name)}
                  onChange={() => togglePicked(file.name)}
                />
                <span className="min-w-0 flex-1 truncate" title={file.name}>
                  {file.name}
                </span>
                <span className="text-hint shrink-0 text-xs">{file.size || "-"}</span>
              </label>
            ))}
            <span className="windows95-text text-hint mt-1 text-xs">
              {t("torrent.files.new.existing", {
                count: files.filter((file) => file.selected).length,
                total: files.length,
              })}
            </span>
          </div>
          <div className="flex justify-end gap-1 p-1">
            <Button variant="outline" onClick={() => setUpdate(null)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={confirm} disabled={picked.size === 0}>
              {t("torrent.files.update.download")}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
