import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import SavedLobby from "@/routes/components/lobby/saved.lobby";
import {
  LOBBY_MAX_DISPLAY_NAME_CHARS,
  LOBBY_TICKET_INPUT_MAX_CHARS,
} from "@/config/lobby/common.config";
import { useI18n } from "@/hooks/i18n.hook";
import { useSessionActions } from "@/hooks/session/actions.hook";
import { useSessionRestore } from "@/hooks/session/restore.hook";
import { parseTicket, formatTicketShare } from "@/lib/session/ticket.utils";
import { useSessionStore } from "@/store/session.store";
import type { ConnectLobbyProps, SavedConnection } from "@/types/lobby";

export default function ConnectLobby({ loading }: ConnectLobbyProps) {
  const { t } = useI18n();
  const displayName = useSessionStore((s) => s.displayName);
  const joinInput = useSessionStore((s) => s.joinInput);
  const setDisplayName = useSessionStore((s) => s.setDisplayName);
  const setJoinInput = useSessionStore((s) => s.setJoinInput);
  const setIdentity = useSessionStore((s) => s.setIdentity);
  const { create, join } = useSessionActions();
  const { decision: restore, settled } = useSessionRestore();
  const [ticketInvalid, setTicketInvalid] = useState(false);
  const [portDraft, setPortDraft] = useState("");
  const [portInvalid, setPortInvalid] = useState(false);

  // One reconnect attempt per mount, and only once the status query settled:
  // while it fetches, the stale role reads as null and would fake a reconnect
  // (both on cold start and right after a manual join).
  const [reconnectTried, setReconnectTried] = useState(false);
  const reconnecting = restore.kind === "reconnect" && join.isPending && reconnectTried;
  useEffect(() => {
    if (join.isPending || !settled || reconnectTried || restore.kind !== "reconnect") {
      return;
    }
    setReconnectTried(true);
    join.mutate({
      name: restore.displayName,
      peerId: restore.peerId,
      ticket: restore.ticket,
    });
  }, [join, settled, reconnectTried, restore]);

  const busy = create.isPending || join.isPending;

  /** Blank or `0` = OS-assigned port; `1..65535` pins the host's UDP port. */
  const handleCreate = () => {
    const draft = portDraft.trim();
    let port: number | null = null;
    if (draft.length > 0) {
      const value = Number(draft);
      if (!Number.isInteger(value) || value < 0 || value > 65535) {
        setPortInvalid(true);
        return;
      }
      port = value === 0 ? null : value;
    }
    setPortInvalid(false);
    create.mutate({ name: displayName, port });
  };

  /** Fill the join field with a saved room's code. */
  const handleUseSaved = (connection: SavedConnection) => {
    setJoinInput(
      formatTicketShare({
        sessionId: connection.sessionId,
        token: connection.token,
        endpointId: connection.endpointId,
      })
    );
    setTicketInvalid(false);
  };

  const handleJoin = () => {
    const ticket = parseTicket(joinInput);
    if (!ticket) {
      setTicketInvalid(true);
      return;
    }
    setTicketInvalid(false);
    join.mutate({ name: displayName, ticket });
  };

  if (restore.kind === "closed") {
    return (
      <div className="flex h-full items-center justify-center overflow-auto p-4">
        <section className="ui-panel w-full max-w-md">
          <div className="ui-titlebar">
            <span className="text-title-text font-bold">
              {t("lobby.restore.closed.title")}
            </span>
          </div>
          <div className="flex flex-col gap-3 p-3">
            <p className="windows95-text text-hint text-xs">
              {t("lobby.restore.closed.hint")}
            </p>
            <Button
              className="self-start"
              onClick={() => setIdentity(null)}
            >
              {t("lobby.restore.closed.start")}
            </Button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center gap-4 overflow-auto p-4">
      <div className="flex w-full max-w-md flex-col gap-3">
        {reconnecting && (
          <p className="windows95-text text-hint text-center text-xs">
            {t("lobby.restore.reconnecting")}
          </p>
        )}
        <section className="ui-panel">
          <div className="ui-titlebar">
            <span className="text-title-text font-bold">
              {t("lobby.connect.title")}
            </span>
          </div>
          <div className="flex flex-col gap-3 p-3">
            <p className="windows95-text text-hint text-xs">
              {t("lobby.connect.description")}
            </p>
            <label className="flex flex-col gap-1">
              <span className="windows95-text text-text text-xs font-bold">
                {t("lobby.name.label")}
              </span>
              <Input
                maxLength={LOBBY_MAX_DISPLAY_NAME_CHARS}
                placeholder={t("lobby.name.placeholder")}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="windows95-text text-text text-xs font-bold">
                {t("lobby.port.label")}
              </span>
              <Input
                aria-invalid={portInvalid}
                inputMode="numeric"
                placeholder={t("lobby.port.placeholder")}
                value={portDraft}
                onChange={(event) => {
                  setPortDraft(event.target.value);
                  if (portInvalid) setPortInvalid(false);
                }}
              />
            </label>
            {portInvalid && (
              <p className="windows95-text text-destructive text-xs">
                {t("lobby.port.invalid")}
              </p>
            )}
            <Button
              className="self-start"
              disabled={busy || loading}
              onClick={handleCreate}
            >
              {t("lobby.create")}
            </Button>
          </div>
        </section>

        <section className="ui-panel">
          <div className="ui-titlebar">
            <span className="text-title-text font-bold">
              {t("lobby.join.title")}
            </span>
          </div>
          <div className="flex flex-col gap-3 p-3">
            <label className="flex flex-col gap-1">
              <span className="windows95-text text-text text-xs font-bold">
                {t("lobby.ticket.label")}
              </span>
              <Input
                aria-invalid={ticketInvalid}
                maxLength={LOBBY_TICKET_INPUT_MAX_CHARS}
                placeholder={t("lobby.ticket.placeholder")}
                value={joinInput}
                onChange={(event) => {
                  setJoinInput(event.target.value);
                  if (ticketInvalid) setTicketInvalid(false);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleJoin();
                }}
              />
            </label>
            {ticketInvalid && (
              <p className="windows95-text text-destructive text-xs">
                {t("lobby.ticket.invalid")}
              </p>
            )}
            <Button
              className="self-start"
              disabled={busy || loading || joinInput.trim().length === 0}
              onClick={handleJoin}
            >
              {t("lobby.join")}
            </Button>
          </div>
        </section>

        {loading && (
          <p className="windows95-text text-hint text-center text-xs">
            {t("lobby.loading")}
          </p>
        )}
      </div>
      <SavedLobby onUse={handleUseSaved} />
    </div>
  );
}
