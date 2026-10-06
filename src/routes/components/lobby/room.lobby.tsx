import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import { useI18n } from "@/hooks/i18n.hook";
import { useSessionActions } from "@/hooks/session/actions.hook";
import { useChatTorrentDownload } from "@/hooks/session/chat.torrent.hook";
import { useSessionHandoverBridge } from "@/hooks/session/handover.hook";
import { useChatPinReactions } from "@/hooks/session/pin-react.hook";
import { useSessionStartBridge } from "@/hooks/session/start.hook";
import { useChatTyping, useTypingSender } from "@/hooks/session/typing.hook";
import { newChatId } from "@/lib/session/chat.utils";
import { transferCandidates } from "@/lib/session/peer.utils";
import { formatTicketShare, ticketRoomLabel } from "@/lib/session/ticket.utils";
import { attempt } from "@/lib/utils/attempt.utils";
import { showError } from "@/lib/utils/notification.utils";
import TorrentFilePicker from "@/routes/components/search/default/picker.search";
import { useConnectionsStore } from "@/store/connections.store";
import { useSessionStore } from "@/store/session.store";
import type { RoomLobbyProps } from "@/types/lobby";

import ChatLobby from "./chat.lobby";
import LeaveLobby from "./leave.lobby";
import PlaylistLobby from "./playlist.lobby";
import RosterLobby from "./roster.lobby";

const COPIED_FEEDBACK_MS = 1500;

export default function RoomLobby({ status }: RoomLobbyProps) {
  const { t } = useI18n();
  const { chat, leave, pin, react, resync, setRole, transferHost } =
    useSessionActions();
  const draft = useSessionStore((s) => s.chatDraft);
  const setChatDraft = useSessionStore((s) => s.setChatDraft);
  const chatReply = useSessionStore((s) => s.chatReply);
  const setChatReply = useSessionStore((s) => s.setChatReply);
  const displayName = useSessionStore((s) => s.displayName);
  const pendingChats = useSessionStore((s) => s.pendingChats);
  const addPendingChat = useSessionStore((s) => s.addPendingChat);
  const removePendingChat = useSessionStore((s) => s.removePendingChat);
  const [copied, setCopied] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  const isHost = status.role === "host";
  const canAttach = status.lobbyRole === "host" || status.lobbyRole === "moderator";
  const chatTorrent = useChatTorrentDownload();
  const typingNames = useChatTyping(status.peers);
  const typing = useTypingSender();
  useChatPinReactions();
  const share = status.ticket ? formatTicketShare(status.ticket) : null;
  const roomCode = status.ticket
    ? ticketRoomLabel(status.ticket)
    : (status.sessionId ?? "").slice(0, 8).toUpperCase();

  useSessionStartBridge(status.role);
  useSessionHandoverBridge(status.role);
  // Hierarchy pick, deterministic tie-break.
  const candidates = useMemo(() => transferCandidates(status.peers), [status.peers]);

  const mentionNames = useMemo(() => {
    const names = status.peers.map((peer) => peer.displayName.trim());
    const own = displayName.trim();
    if (own.length > 0) names.push(own);
    return [...new Set(names.filter((name) => name.length > 0))];
  }, [status.peers, displayName]);

  const pinnedByName = useMemo(() => {
    if (status.pinned === null) return "";
    const pinner = status.pinned.pinnedBy;
    return (
      status.peers.find((peer) => peer.peerId === pinner)?.displayName ?? pinner
    );
  }, [status.pinned, status.peers]);

  const missingByPeer = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const peerIds of Object.values(status.missing)) {
      for (const peerId of peerIds) {
        counts[peerId] = (counts[peerId] ?? 0) + 1;
      }
    }
    return counts;
  }, [status.missing]);

  useEffect(
    () => () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    },
    []
  );

  const handleCopy = useCallback(async () => {
    if (!share) return;
    const [, error] = await attempt(writeText(share));
    if (error) {
      showError(t("lobby.error.title"), error.message);
      return;
    }
    setCopied(true);
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(
      () => setCopied(false),
      COPIED_FEEDBACK_MS
    );
  }, [share, t]);

  const handleSaveConnection = () => {
    if (!status.ticket) return;
    useConnectionsStore.getState().save({
      endpointId: status.ticket.endpointId,
      sessionId: status.sessionId ?? status.ticket.sessionId,
      token: status.ticket.token,
      name: displayName,
      nick: displayName,
      addrs: status.addrs,
      savedAt: Date.now(),
    });
  };

  const handleSend = (animeId: number | null) => {
    const text = draft.trim();
    if (text.length === 0) return;
    typing.noteStopped();
    const id = newChatId();
    const links =
      animeId !== null ? [`https://anilist.co/anime/${animeId}`] : [];
    // Optimistic echo, reconciled by id.
    addPendingChat({
      id,
      from: displayName.trim() || t("lobby.chat.you"),
      text,
      at: Date.now() / 1000,
      links,
      replyTo: chatReply,
      attachment: null,
    });
    chat.mutate(
      { text, id, replyTo: chatReply, links },
      {
        onSuccess: () => {
          setChatDraft("");
          setChatReply(null);
        },
        onError: () => removePendingChat(id),
      }
    );
  };

  useEffect(() => {
    if (pendingChats.length === 0) return;
    const echoed = new Set(status.chat.map((message) => message.id));
    for (const pending of pendingChats) {
      if (echoed.has(pending.id)) removePendingChat(pending.id);
    }
  }, [pendingChats, removePendingChat, status.chat]);

  const messages = useMemo(() => {
    const echoed = new Set(status.chat.map((message) => message.id));
    return [
      ...status.chat,
      ...pendingChats.filter((pending) => !echoed.has(pending.id)),
    ];
  }, [pendingChats, status.chat]);

  const handleAttach = () => chatTorrent.attachFromFile();
  const handleDownloadAttachment = (messageId: string) =>
    chatTorrent.openAttachment(messageId);
  const handleTorrentLink = (token: string) => chatTorrent.openLink(token);
  const handleConfirmPicker = (
    selected: number[],
    dir: string,
    subFolder: string | undefined,
    sequential?: boolean
  ) => chatTorrent.confirmPicker(selected, dir, subFolder, sequential);
  const handleCancelPicker = () => chatTorrent.cancelPicker();

  const handleDraftChange = (value: string) => {
    if (value.trim().length > 0) {
      typing.noteTyping();
    } else {
      typing.noteStopped();
    }
    setChatDraft(value);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2">
      <header className="ui-panel flex items-center gap-2 px-2 py-1">
        <span className="windows95-text text-text text-xs font-bold">
          {isHost ? t("lobby.room.host") : t("lobby.room.guest")}
        </span>
        {roomCode.length > 0 && (
          <span className="windows95-text text-hint text-xs">
            {t("lobby.room.code", { code: roomCode })}
          </span>
        )}
        <span className="flex-1" />
        {isHost && (
          <Button
            disabled={resync.isPending}
            onClick={() => resync.mutate()}
            title={t("lobby.forceResync.hint")}
          >
            {t("lobby.forceResync")}
          </Button>
        )}
        <Button
          disabled={leave.isPending || transferHost.isPending}
          onClick={() => (isHost ? setLeaveOpen(true) : leave.mutate())}
        >
          {t("lobby.leave")}
        </Button>
      </header>

      <LeaveLobby
        open={leaveOpen && isHost}
        candidates={candidates}
        leavePending={leave.isPending}
        transferPending={transferHost.isPending}
        onClose={() => setLeaveOpen(false)}
        onLeave={() =>
          leave.mutate(undefined, { onSuccess: () => setLeaveOpen(false) })
        }
        onTransfer={(peerId) =>
          transferHost.mutate(peerId, {
            onSuccess: () => setLeaveOpen(false),
          })
        }
      />

      {!(isHost || status.hostOnline) && (
        <section className="ui-panel flex items-center gap-2 px-2 py-1">
          <span className="text-destructive text-xs font-bold">
            {t("lobby.player.hostLost")}
          </span>
          <span className="windows95-text text-hint text-xs">
            {t("lobby.room.hostLost.hint")}
          </span>
        </section>
      )}

      {isHost && share && (
        <section className="ui-panel">
          <div className="ui-titlebar">
            <span className="text-title-text font-bold">
              {t("lobby.ticket.title")}
            </span>
          </div>
          <div className="flex flex-col gap-1 p-2">
            <p className="windows95-text text-hint text-xs">
              {t("lobby.ticket.hint")}
            </p>
            <div className="flex items-center gap-1">
              <Input
                readOnly
                value={share}
                onFocus={(event) => event.currentTarget.select()}
              />
              <Button onClick={handleCopy}>
                {copied ? t("lobby.ticket.copied") : t("lobby.ticket.copy")}
              </Button>
            </div>
            <div className="flex items-center gap-1">
              <Button onClick={handleSaveConnection}>
                {t("lobby.saved.save")}
              </Button>
            </div>
            {status.addrs.length > 0 && (
              <div className="flex flex-col gap-0.5">
                <p className="windows95-text text-hint text-xs">
                  {t("lobby.ticket.addrs")}
                </p>
                {status.addrs.map((addr) => (
                  <span key={addr} className="windows95-text text-text text-xs">
                    {addr}
                  </span>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      <PlaylistLobby status={status} />

      <div className="flex min-h-0 flex-1 gap-2">
        <RosterLobby
          lobbyRole={status.lobbyRole}
          missingByPeer={missingByPeer}
          peers={status.peers}
          onSetRole={(peerId, role) => setRole.mutate({ peerId, role })}
        />
        <ChatLobby
          attachPending={chatTorrent.attachPending}
          canAttach={canAttach}
          canPin={canAttach}
          draft={draft}
          failedAttachment={chatTorrent.failed}
          fetchingAttachment={chatTorrent.fetching}
          messages={messages}
          myPeerId={status.yourPeerId}
          onAttach={handleAttach}
          onDownloadAttachment={handleDownloadAttachment}
          onDraftChange={handleDraftChange}
          onPin={(messageId) => pin.mutate(messageId)}
          onReact={(input) => react.mutate(input)}
          onReplyChange={setChatReply}
          onSend={handleSend}
          onTorrentLink={handleTorrentLink}
          pending={chat.isPending}
          mentionNames={mentionNames}
          pinned={status.pinned}
          pinnedByName={pinnedByName}
          reactions={status.reactions}
          replyTo={chatReply}
          typingNames={typingNames}
        />
      </div>

      {chatTorrent.picker !== null && (
        <TorrentFilePicker
          defaultSaveDir={chatTorrent.picker.saveDir}
          torrent={{
            ...(chatTorrent.picker.source.kind === "magnet"
              ? { magnet: chatTorrent.picker.source.magnet }
              : {}),
            conflictingFiles: chatTorrent.picker.info.conflicting_files,
            files: chatTorrent.picker.info.files,
            hasCommonFolder: chatTorrent.picker.info.has_common_folder,
            id: chatTorrent.picker.info.id,
            name: chatTorrent.picker.info.name,
          }}
          onConfirm={handleConfirmPicker}
          onCancel={handleCancelPicker}
        />
      )}
    </div>
  );
}
