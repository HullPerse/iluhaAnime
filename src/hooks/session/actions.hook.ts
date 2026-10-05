import { useMutation, useQueryClient } from "@tanstack/react-query";

import { sessionApi } from "@/api/session.api";
import { useI18n } from "@/hooks/i18n.hook";
import { ticketRoomLabel } from "@/lib/session/ticket.utils";
import { toError } from "@/lib/utils/attempt.utils";
import { showError } from "@/lib/utils/notification.utils";
import { useConnectionsStore } from "@/store/connections.store";
import { useSessionStore } from "@/store/session.store";
import type {
  ControlAction,
  ItemReport,
  LobbyRole,
  MediaPlanItem,
  SessionTicket,
  SourceInfo,
} from "@/types/session";

import { SESSION_STATUS_QUERY_KEY } from "./queries.hook";

/**
 * Session lifecycle actions. Each mutation invalidates the status query so the
 * polled view reflects the new role/roster immediately.
 */
export function useSessionActions() {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const displayName = useSessionStore((s) => s.displayName);

  const onError = (error: unknown) => showError(t("lobby.error.title"), toError(error).message);
  const onSettled = () =>
    queryClient.invalidateQueries({ queryKey: SESSION_STATUS_QUERY_KEY });

  const nameOrDefault = (value: string) => (value.trim().length > 0 ? value.trim() : displayName);

  const create = useMutation({
    mutationFn: (input: { name: string; port: number | null }) =>
      sessionApi.create(nameOrDefault(input.name), input.port),
    onError,
    onSettled,
    // A host room is not restored after a restart; the stored identity only
    // lets a later mount report the room as closed.
    onSuccess: (ticket: SessionTicket, input: { name: string; port: number | null }) => {
      useSessionStore.getState().setIdentity({
        sessionId: ticket.sessionId,
        ticket,
        displayName: nameOrDefault(input.name),
        peerId: null,
        role: "host",
      });
    },
  });

  const join = useMutation({
    mutationFn: (input: { ticket: SessionTicket; name: string; peerId?: string | null }) =>
      sessionApi.join(input.ticket, nameOrDefault(input.name), null, input.peerId ?? null),
    onSuccess: (status, input) => {
      useSessionStore.getState().setIdentity({
        sessionId: status.sessionId ?? input.ticket.sessionId,
        ticket: input.ticket,
        displayName: nameOrDefault(input.name),
        peerId: status.yourPeerId,
        role: "guest",
      });
      // Keep the room in the address book: the entry is titled with the
      // host's name as seen in the roster (the room code as a fallback) and
      // carries the direct paths this connection actually used.
      const hostName = status.peers.find((peer) => peer.role === "host")?.displayName;
      useConnectionsStore.getState().save({
        endpointId: input.ticket.endpointId,
        sessionId: status.sessionId ?? input.ticket.sessionId,
        token: input.ticket.token,
        name: hostName?.trim() || ticketRoomLabel(input.ticket),
        nick: hostName?.trim() || ticketRoomLabel(input.ticket),
        addrs: status.addrs,
        savedAt: Date.now(),
      });
    },
    // The host rejects a foreign build with `app version mismatch: ...`
    // (host.rs); swap it for a localized sentence instead of raw English.
    onError: (error: unknown) => {
      const message = toError(error).message;
      showError(
        t("lobby.error.title"),
        message.startsWith("app version mismatch")
          ? t("lobby.error.versionMismatch")
          : message
      );
    },
    onSettled,
  });

  const leave = useMutation({
    mutationFn: () => sessionApi.leave(),
    onError,
    onSettled,
    onSuccess: () => {
      useSessionStore.getState().clearPlanPaths();
      useSessionStore.getState().setPlayingItemId(null);
      useSessionStore.getState().setIdentity(null);
    },
  });

  const chat = useMutation({
    mutationFn: (input: {
      text: string;
      id: string;
      replyTo?: string | null;
      file?: { name: string; bytes: number[] } | null;
    }) => sessionApi.chat(input.text, input.id, input.replyTo, input.file),
    onError,
    onSettled,
  });

  const resync = useMutation({
    mutationFn: () => sessionApi.forceResync(),
    onError,
    onSettled,
  });

  const setPlaylist = useMutation({
    mutationFn: (input: {
      items: MediaPlanItem[];
      paths?: Record<string, string>;
    }) => sessionApi.setPlaylist(input.items, input.paths),
    onError,
    onSettled,
  });

  /** Host/moderator: start a plan item (or hold until every peer has it). */
  const startItem = useMutation({
    mutationFn: (itemId: string) => sessionApi.startItem(itemId),
    onError,
    onSettled,
  });

  /** Host: promote or demote a guest. */
  const setRole = useMutation({
    mutationFn: (input: { peerId: string; role: LobbyRole }) =>
      sessionApi.setRole(input.peerId, input.role),
    onError,
    onSettled,
  });

  /** Host: hand the room to a chosen peer and rejoin it as a viewer. */
  const transferHost = useMutation({
    mutationFn: (peerId: string) =>
      sessionApi.transferHost({ peerId, displayName: nameOrDefault("") }),
    onError,
    onSettled,
  });

  const addSource = useMutation({
    mutationFn: (input: { itemId: string; source: SourceInfo }) =>
      sessionApi.addSource(input.itemId, input.source),
    onError,
    onSettled,
  });

  const removeSource = useMutation({
    mutationFn: (input: { itemId: string; sourceId: string }) =>
      sessionApi.removeSource(input.itemId, input.sourceId),
    onError,
    onSettled,
  });

  /** Guest: search a folder for a byte-exact copy of a plan item. */
  const matchFolder = useMutation({
    mutationFn: (input: { itemId: string; folder: string }) =>
      sessionApi.matchFolder(input.itemId, input.folder),
    onError,
    onSettled,
  });

  const setReady = useMutation({
    mutationFn: (input: { ready: boolean; items: ItemReport[] }) =>
      sessionApi.setReady(input.ready, input.items),
    onError,
    onSettled,
  });

  const control = useMutation({
    mutationFn: (action: ControlAction) => sessionApi.control(action),
    onError,
    onSettled,
  });

  /** Compute a media identity for a local path before attaching it. */
  const mediaIdentity = useMutation({
    mutationFn: (path: string) => sessionApi.mediaIdentity(path),
    onError,
    onSettled,
  });

  /** Host + moderators: pin or unpin the room's single chat anchor. */
  const pin = useMutation({
    mutationFn: (messageId: string | null) => sessionApi.pin(messageId),
    onError,
    onSettled,
  });

  /** Add or remove a reaction on one chat message. */
  const react = useMutation({
    mutationFn: (input: { messageId: string; emoji: string; add: boolean }) =>
      sessionApi.react(input),
    onError,
    onSettled,
  });

  return {
    addSource,
    chat,
    control,
    create,
    join,
    leave,
    matchFolder,
    mediaIdentity,
    pin,
    react,
    removeSource,
    resync,
    setPlaylist,
    setReady,
    setRole,
    startItem,
    transferHost,
  };
}
