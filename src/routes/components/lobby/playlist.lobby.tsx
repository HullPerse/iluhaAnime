import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useEffect, useMemo, useRef, useState } from "react";

import { torrentApi } from "@/api/torrent.api";
import type { TorrentInfoResult } from "@/api/torrent.api";
import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import { useI18n } from "@/hooks/i18n.hook";
import { useSessionActions } from "@/hooks/session/actions.hook";
import { useSessionDownloadVerify } from "@/hooks/session/verify.hook";
import { newChatId } from "@/lib/session/chat.utils";
import { resolveOnlyFiles } from "@/lib/session/download.utils";
import { analyzeCompatibility, itemReports } from "@/lib/session/match.utils";
import { buildHostMagnet, detectSourceKind } from "@/lib/session/source.utils";
import { attempt } from "@/lib/utils/attempt.utils";
import { ignore } from "@/lib/utils/promise.utils";
import { buildTorrentLink } from "@/lib/utils/deeplink.utils";
import { showError } from "@/lib/utils/notification.utils";
import TorrentFilePicker from "@/routes/components/search/default/picker.search";
import CreateTorrentModal from "@/routes/components/torrent/create.torrent";
import { useCacheStore } from "@/store/cache.store";
import { useNotificationStore } from "@/store/notification.store";
import { useSessionStore } from "@/store/session.store";
import type { PlaylistLobbyProps } from "@/types/lobby";
import type { CompatibilityReport, MatchLevel, MediaPlanItem, SourceInfo } from "@/types/session";
import type { CreatedTorrent } from "@/types/torrent";

import PlanItemRow from "./plan.item.lobby";

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `src-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function fileTitle(path: string): string {
  const trimmed = path.trim().replace(/[\\/]+$/, "");
  const parts = trimmed.split(/[\\/]/);
  return parts.at(-1) ?? trimmed;
}

function hostMagnet(item: MediaPlanItem): string {
  return item.sources.find((source) => source.kind === "hostSeeded")?.value ?? "";
}

export default function PlaylistLobby({ status }: PlaylistLobbyProps) {
  const { t } = useI18n();
  const {
    addSource,
    chat,
    matchFolder,
    mediaIdentity,
    removeSource,
    setPlaylist,
    setReady,
    startItem,
  } = useSessionActions();
  const isHost = status.role === "host";
  const canStart = status.lobbyRole === "host" || status.lobbyRole === "moderator";
  const plan = status.plan;

  const setPlanPath = useSessionStore((s) => s.setPlanPath);

  const [newItemPath, setNewItemPath] = useState("");
  const [sourceDrafts, setSourceDrafts] = useState<Record<string, string>>({});
  const [fileDrafts, setFileDrafts] = useState<Record<string, string>>({});
  const [reports, setReports] = useState<Record<string, CompatibilityReport>>({});
  const [torrentItemId, setTorrentItemId] = useState<string | null>(null);
  const [picker, setPicker] = useState<{
    item: MediaPlanItem;
    info: TorrentInfoResult;
    saveDir: string;
  } | null>(null);
  /** Failed identity check (re-download offer). */
  const [failed, setFailed] = useState<Record<string, MatchLevel>>({});
  const [verifying, setVerifying] = useState<Record<string, boolean>>({});
  const lastReport = useRef("");

  const namesById = useMemo(() => {
    const map = new Map<string, string>();
    for (const peer of status.peers) map.set(peer.peerId, peer.displayName);
    return map;
  }, [status.peers]);

  const readyCount = status.ready.peers.filter((peer) => peer.ready).length;
  const total = status.peers.length;
  const heldItemId = status.waiting?.itemId ?? null;
  const heldNames = (status.waiting?.peerIds ?? []).map(
    (peerId) => namesById.get(peerId) ?? peerId
  );
  const missingNamesFor = (itemId: string) =>
    (status.missing[itemId] ?? []).map(
      (peerId) => namesById.get(peerId) ?? peerId
    );

  const reportReady = setReady.mutate;
  const levels = useMemo(() => {
    const map: Record<string, MatchLevel> = {};
    for (const [itemId, report] of Object.entries(reports)) {
      map[itemId] = report.level;
    }
    return map;
  }, [reports]);
  useEffect(() => {
    if (isHost) return;
    const items = itemReports(plan, levels);
    const key = JSON.stringify(items);
    if (key === lastReport.current) return;
    lastReport.current = key;
    reportReady({ items, ready: true });
  }, [isHost, levels, plan, reportReady]);

  const { trackDownload } = useSessionDownloadVerify({
    enabled: !isHost,
    onMismatch: (itemId, _path, report) => {
      setReports((prev) => ({ ...prev, [itemId]: report }));
      setFailed((prev) => ({ ...prev, [itemId]: report.level }));
    },
    onVerified: (itemId, path, report) => {
      setReports((prev) => ({ ...prev, [itemId]: report }));
      setFailed((prev) => {
        if (prev[itemId] === undefined) return prev;
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
      setPlanPath(itemId, path);
    },
    onVerifyDone: (itemId) => {
      setVerifying((prev) => {
        if (!prev[itemId]) return prev;
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
    },
    onVerifyStart: (itemId) => {
      setVerifying((prev) => ({ ...prev, [itemId]: true }));
    },
    plan,
  });

  const handleAddItem = () => {
    const path = newItemPath.trim();
    if (path.length === 0) return;
    mediaIdentity.mutate(path, {
      onSuccess: (identity) => {
        const item: MediaPlanItem = {
          identity,
          itemId: randomId(),
          order: plan.length,
          sources: [],
          title: fileTitle(path),
        };
        setPlaylist.mutate(
          {
            items: [...plan, item],
            paths: { ...status.paths, [item.itemId]: path },
          },
          { onSuccess: () => setNewItemPath("") }
        );
      },
    });
  };

  const handleRemoveItem = (itemId: string) => {
    setPlaylist.mutate({
      items: plan.filter((item) => item.itemId !== itemId),
      paths: status.paths,
    });
  };

  const handleStartItem = (itemId: string) => {
    startItem.mutate(itemId);
  };

  const handleAddSource = (item: MediaPlanItem) => {
    const value = (sourceDrafts[item.itemId] ?? "").trim();
    if (value.length === 0) return;
    const source: SourceInfo = {
      kind: detectSourceKind(value),
      label: null,
      sourceId: randomId(),
      status: "missing",
      value,
    };
    addSource.mutate(
      { itemId: item.itemId, source },
      {
        onSuccess: () =>
          setSourceDrafts((prev) => ({ ...prev, [item.itemId]: "" })),
      }
    );
  };

  const handleRemoveSource = (itemId: string, sourceId: string) => {
    removeSource.mutate({ itemId, sourceId });
  };

  const handleUseFile = (item: MediaPlanItem) => {
    const path = (fileDrafts[item.itemId] ?? "").trim();
    if (path.length === 0) return;
    mediaIdentity.mutate(path, {
      onSuccess: (identity) => {
        setReports((prev) => ({
          ...prev,
          [item.itemId]: analyzeCompatibility(item.identity, identity),
        }));
        setPlanPath(item.itemId, path);
      },
    });
  };

  const handleTorrentCreated = (itemId: string, created: CreatedTorrent) => {
    addSource.mutate({
      itemId,
      source: {
        kind: "hostSeeded",
        label: created.name,
        sourceId: randomId(),
        status: "ready",
        value: buildHostMagnet(created.info_hash, created.name),
      },
    });
    chat.mutate({ text: buildTorrentLink(created.info_hash), id: newChatId() });
  };

  const startHostDownload = async (
    item: MediaPlanItem,
    info: TorrentInfoResult,
    saveDir: string,
    selected: number[] | null,
    subFolder: string | null | undefined,
    sequential: boolean
  ) => {
    const [id, startError] = await attempt(
      torrentApi.startTorrentDownload({
        magnet: hostMagnet(item),
        saveDir,
        onlyFiles: selected === null ? null : resolveOnlyFiles(info.files, selected),
        subFolder: subFolder ?? null,
        sequential,
      })
    );
    if (startError || id === undefined) {
      showError(
        t("lobby.error.title"),
        startError ? startError.message : t("lobby.playlist.download.failed")
      );
      return;
    }
    trackDownload(id, {
      files: info.files,
      itemId: item.itemId,
      saveDir,
      selected,
      subFolder: subFolder ?? null,
    });
    useNotificationStore
      .getState()
      .add(
        t("lobby.playlist.download.started"),
        "success",
        t("lobby.playlist.download.hint", { title: item.title })
      );
  };

  const handleDownloadFromHost = async (item: MediaPlanItem) => {
    const magnet = hostMagnet(item);
    if (magnet.trim().length === 0) return;
    let saveDir = useCacheStore.getState().lastSaveDir;
    if (!saveDir) {
      const [dir, dirError] = await attempt(
        openDialog({
          directory: true,
          title: t("lobby.playlist.download.title"),
        })
      );
      if (dirError || !dir) return;
      saveDir = dir;
      useCacheStore.getState().setLastSaveDir(dir);
    }
    const [info, infoError] = await attempt(torrentApi.getTorrentInfo(magnet, saveDir));
    if (infoError || !info) {
      showError(
        t("lobby.error.title"),
        infoError ? infoError.message : t("lobby.playlist.download.failed")
      );
      return;
    }
    if (info.files.length <= 1) {
      await startHostDownload(item, info, saveDir, null, null, false);
      return;
    }
    setPicker({ info, item, saveDir });
  };

  const handleRedownload = (item: MediaPlanItem) => {
    setFailed((prev) => {
      if (prev[item.itemId] === undefined) return prev;
      const next = { ...prev };
      delete next[item.itemId];
      return next;
    });
    ignore(handleDownloadFromHost(item));
  };

  const handlePickFolder = async (item: MediaPlanItem) => {
    const [dir, dirError] = await attempt(
      openDialog({
        directory: true,
        title: t("lobby.playlist.pickFolder.title"),
      })
    );
    if (dirError || !dir) return;
    matchFolder.mutate(
      { folder: dir, itemId: item.itemId },
      {
        onSuccess: (path) => {
          if (path) {
            setReports((prev) => ({
              ...prev,
              [item.itemId]: { level: "exact", deltas: [] },
            }));
            setPlanPath(item.itemId, path);
            return;
          }
          showError(t("lobby.error.title"), t("lobby.playlist.pickFolder.none"));
        },
      }
    );
  };

  return (
    <section className="ui-panel flex min-h-0 flex-col">
      <div className="ui-titlebar flex items-center gap-2">
        <span className="text-title-text font-bold">
          {t("lobby.playlist.title")}
        </span>
        <span className="flex-1" />
        <span className="windows95-text text-text text-xs">
          {t("lobby.playlist.readyGate", { ready: readyCount, total })}
        </span>
      </div>

      {heldItemId !== null && heldNames.length > 0 && (
        <p className="windows95-text text-highlight px-2 pt-1 text-xs">
          {t("lobby.playlist.heldFor", { names: heldNames.join(", ") })}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-auto p-2">
        {plan.length === 0 ? (
          <p className="windows95-text text-hint text-xs">
            {isHost
              ? t("lobby.playlist.emptyHost")
              : t("lobby.playlist.emptyGuest")}
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {plan.map((item, index) => (
              <PlanItemRow
                canStart={canStart}
                fileDraft={fileDrafts[item.itemId] ?? ""}
                index={index}
                isHeld={heldItemId === item.itemId}
                isHost={isHost}
                item={item}
                key={item.itemId}
                missingNames={missingNamesFor(item.itemId)}
                report={reports[item.itemId]}
                sourceDraft={sourceDrafts[item.itemId] ?? ""}
                verifying={verifying[item.itemId] === true}
                verifyFailed={failed[item.itemId] ?? null}
                onAddSource={() => handleAddSource(item)}
                onCreateTorrent={() => setTorrentItemId(item.itemId)}
                onDownloadFromHost={() => handleDownloadFromHost(item)}
                onFileDraftChange={(value) =>
                  setFileDrafts((prev) => ({ ...prev, [item.itemId]: value }))
                }
                onPickFolder={() => handlePickFolder(item)}
                onRedownload={() => handleRedownload(item)}
                onRemoveItem={() => handleRemoveItem(item.itemId)}
                onRemoveSource={(sourceId) =>
                  handleRemoveSource(item.itemId, sourceId)
                }
                onSourceDraftChange={(value) =>
                  setSourceDrafts((prev) => ({ ...prev, [item.itemId]: value }))
                }
                onStartItem={() => handleStartItem(item.itemId)}
                onUseFile={() => handleUseFile(item)}
              />
            ))}
          </ul>
        )}

        {isHost && (
          <div className="mt-2 flex items-center gap-1">
            <Input
              placeholder={t("lobby.playlist.addItem.placeholder")}
              value={newItemPath}
              onChange={(event) => setNewItemPath(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleAddItem();
              }}
            />
            <Button
              disabled={mediaIdentity.isPending || setPlaylist.isPending}
              onClick={handleAddItem}
            >
              {t("lobby.playlist.addItem")}
            </Button>
          </div>
        )}
      </div>

      {torrentItemId !== null && (
        <CreateTorrentModal
          open
          onClose={() => setTorrentItemId(null)}
          onCreated={(created) => handleTorrentCreated(torrentItemId, created)}
        />
      )}

      {picker !== null && (
        <TorrentFilePicker
          torrent={{
            ...(hostMagnet(picker.item)
              ? { magnet: hostMagnet(picker.item) }
              : {}),
            conflictingFiles: picker.info.conflicting_files,
            files: picker.info.files,
            hasCommonFolder: picker.info.has_common_folder,
            id: picker.info.id,
            name: picker.info.name,
          }}
          defaultSaveDir={picker.saveDir}
          onConfirm={async (selectedIndices, dir, subFolder, sequential) => {
            const current = picker;
            setPicker(null);
            await startHostDownload(
              current.item,
              current.info,
              dir,
              selectedIndices,
              subFolder,
              sequential ?? false
            );
          }}
          onCancel={() => setPicker(null)}
        />
      )}
    </section>
  );
}
