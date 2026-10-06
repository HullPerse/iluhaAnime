import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useState } from "react";

import { sessionApi } from "@/api/session.api";
import { systemApi } from "@/api/system.api";
import { torrentApi } from "@/api/torrent.api";
import type { TorrentInfoResult } from "@/api/torrent.api";
import { LOBBY_CHAT_ATTACHMENT_MAX_BYTES } from "@/config/lobby/common.config";
import { useI18n } from "@/hooks/i18n.hook";
import { newChatId, torrentLinkMagnet } from "@/lib/session/chat.utils";
import { resolveOnlyFiles } from "@/lib/session/download.utils";
import { attempt } from "@/lib/utils/attempt.utils";
import { showError } from "@/lib/utils/notification.utils";
import { ignore } from "@/lib/utils/promise.utils";
import { useCacheStore } from "@/store/cache.store";
import { useNotificationStore } from "@/store/notification.store";

import { useSessionActions } from "./actions.hook";

export type ChatTorrentSource =
  | { kind: "magnet"; magnet: string }
  | { kind: "file"; fileBytes: number[] };

export interface ChatTorrentPicker {
  source: ChatTorrentSource;
  info: TorrentInfoResult;
  saveDir: string;
}

export interface ChatTorrentDownload {
  picker: ChatTorrentPicker | null;
  fetching: string | null;
  failed: string | null;
  attachPending: boolean;
  openLink: (token: string) => void;
  openAttachment: (messageId: string) => void;
  attachFromFile: () => void;
  confirmPicker: (
    selectedIndices: number[],
    saveDir: string,
    subFolder: string | undefined,
    sequential?: boolean
  ) => Promise<void>;
  cancelPicker: () => void;
}

// lobby.md §14.4; no verification.
export function useChatTorrentDownload(): ChatTorrentDownload {
  const { t } = useI18n();
  const { chat } = useSessionActions();
  const [picker, setPicker] = useState<ChatTorrentPicker | null>(null);
  const [fetching, setFetching] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const ensureSaveDir = async (): Promise<string | null> => {
    const cached = useCacheStore.getState().lastSaveDir;
    if (cached.trim().length > 0) return cached;
    const [dir, error] = await attempt(
      openDialog({ directory: true, title: t("lobby.chat.download.title") })
    );
    if (error || !dir || typeof dir !== "string") return null;
    useCacheStore.getState().setLastSaveDir(dir);
    return dir;
  };

  const startDownload = async (
    source: ChatTorrentSource,
    info: TorrentInfoResult,
    saveDir: string,
    selected: number[] | null,
    subFolder: string | null | undefined,
    sequential: boolean
  ) => {
    const [, error] = await attempt(
      torrentApi.startTorrentDownload({
        ...(source.kind === "magnet"
          ? { magnet: source.magnet }
          : { fileBytes: source.fileBytes }),
        saveDir,
        onlyFiles: selected === null ? null : resolveOnlyFiles(info.files, selected),
        subFolder: subFolder ?? null,
        sequential,
      })
    );
    if (error) {
      showError(t("lobby.error.title"), error.message);
      return;
    }
    useNotificationStore
      .getState()
      .add(
        t("lobby.chat.download.started"),
        "success",
        t("lobby.chat.download.hint", { name: info.name })
      );
  };

  const open = async (source: ChatTorrentSource) => {
    const saveDir = await ensureSaveDir();
    if (saveDir === null) return;
    const [info, error] = await attempt(
      source.kind === "magnet"
        ? torrentApi.getTorrentInfo(source.magnet, saveDir)
        : torrentApi.getTorrentInfoFromFile(source.fileBytes, saveDir)
    );
    if (error || !info) {
      showError(
        t("lobby.error.title"),
        error ? error.message : t("lobby.chat.download.failed")
      );
      return;
    }
    if (info.files.length <= 1) {
      await startDownload(source, info, saveDir, null, null, false);
      return;
    }
    setPicker({ info, saveDir, source });
  };

  const openLink = (token: string) => {
    const magnet = torrentLinkMagnet(token);
    if (magnet === null) return;
    ignore(open({ kind: "magnet", magnet }));
  };

  const openAttachment = (messageId: string) => {
    if (fetching !== null) return;
    setFetching(messageId);
    setFailed(null);
    ignore(
      (async () => {
        const [file, error] = await attempt(sessionApi.chatAttachment(messageId));
        setFetching(null);
        if (error || !file) {
          setFailed(messageId);
          showError(
            t("lobby.error.title"),
            error && error.message.includes("no longer available")
              ? t("lobby.chat.attachment.gone")
              : error
                ? error.message
                : t("lobby.chat.download.failed")
          );
          return;
        }
        await open({ kind: "file", fileBytes: file.bytes });
      })()
    );
  };

  const attachFromFile = () => {
    ignore(
      (async () => {
        const [path, error] = await attempt(
          openDialog({
            filters: [{ extensions: ["torrent"], name: "Torrent" }],
            multiple: false,
            title: t("lobby.chat.attach"),
          })
        );
        if (error || !path || typeof path !== "string") return;
        const name = path.split(/[\\/]/).at(-1) ?? "";
        if (!name.toLowerCase().endsWith(".torrent")) {
          showError(t("lobby.error.title"), t("lobby.chat.attach.notTorrent"));
          return;
        }
        const [bytes, readError] = await attempt(systemApi.readFileBytes(path));
        if (readError || !bytes) {
          showError(
            t("lobby.error.title"),
            readError ? readError.message : t("lobby.chat.attach.failed")
          );
          return;
        }
        if (bytes.length > LOBBY_CHAT_ATTACHMENT_MAX_BYTES) {
          showError(t("lobby.error.title"), t("lobby.chat.attach.tooBig"));
          return;
        }
        chat.mutate({ file: { bytes, name }, id: newChatId(), text: "" });
      })()
    );
  };

  const confirmPicker = async (
    selectedIndices: number[],
    saveDir: string,
    subFolder: string | undefined,
    sequential?: boolean
  ) => {
    const current = picker;
    setPicker(null);
    if (current === null) return;
    await startDownload(
      current.source,
      current.info,
      saveDir,
      selectedIndices,
      subFolder,
      sequential ?? false
    );
  };

  return {
    attachFromFile,
    attachPending: chat.isPending,
    cancelPicker: () => setPicker(null),
    confirmPicker,
    failed,
    fetching,
    openAttachment,
    openLink,
    picker,
  };
}
