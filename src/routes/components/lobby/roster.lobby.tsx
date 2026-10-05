import { cn } from "cn";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import type { TranslationKey } from "@/types/i18n";
import type { LobbyRole, PeerInfo } from "@/types/session";

interface RosterLobbyProps {
  peers: PeerInfo[];
  /** Overrides the default fixed width when embedded in the player panel. */
  className?: string;
  /** The local instance's role, to decide which controls to show. */
  lobbyRole?: LobbyRole | null;
  /** Host: change a guest's role. Omit to hide the promote/demote controls. */
  onSetRole?: (peerId: string, role: LobbyRole) => void;
  /** Peer id → number of plan items that peer is missing (badge). */
  missingByPeer?: Record<string, number>;
}

function avatarLetter(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed.charAt(0).toUpperCase() : "?";
}

function roleKey(role: LobbyRole): TranslationKey {
  return role === "host" ? "lobby.roster.host" : "lobby.roster.moderator";
}

export default function RosterLobby({
  peers,
  className,
  lobbyRole = null,
  onSetRole,
  missingByPeer = {},
}: RosterLobbyProps) {
  const { t } = useI18n();
  const isHost = lobbyRole === "host";

  return (
    <section
      className={cn(
        "ui-panel flex min-h-0 flex-col",
        className ?? "w-56 shrink-0"
      )}
    >
      <div className="ui-titlebar">
        <span className="text-title-text font-bold">
          {t("lobby.roster.title")}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-1">
        {peers.length === 0 ? (
          <p className="windows95-text text-hint p-2 text-xs">
            {t("lobby.roster.empty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {peers.map((peer) => (
              <li
                className={cn(
                  "flex items-center gap-2 p-1",
                  peer.left && "opacity-60"
                )}
                key={peer.peerId}
              >
                <span
                  aria-hidden
                  className="windows95-border bg-primary text-text windows95-text flex size-6 shrink-0 items-center justify-center font-bold"
                >
                  {avatarLetter(peer.displayName)}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="windows95-text text-text truncate text-xs font-bold">
                    {peer.displayName}
                    {peer.role !== "viewer" && (
                      <span className="text-hint font-normal">
                        {" · "}
                        {t(roleKey(peer.role))}
                      </span>
                    )}
                  </span>
                  <span className="windows95-text text-hint text-xs">
                    {t("lobby.roster.stats", {
                      drift: Math.round(peer.driftMs),
                      rtt: Math.round(peer.rttMs),
                    })}
                  </span>
                </span>
                {(missingByPeer[peer.peerId] ?? 0) > 0 && (
                  <span className="windows95-text text-highlight text-xs">
                    {t("lobby.roster.missingFiles", {
                      count: missingByPeer[peer.peerId] ?? 0,
                    })}
                  </span>
                )}
                {peer.left ? (
                  <span className="windows95-text text-highlight text-xs font-bold">
                    {t("lobby.roster.left")}
                  </span>
                ) : (
                  <span className="windows95-text text-hint text-xs uppercase">
                    {peer.connection}
                  </span>
                )}
                {isHost && onSetRole && peer.role !== "host" && (
                  <Button
                    size="icon"
                    title={t(
                      peer.role === "moderator"
                        ? "lobby.roster.demote"
                        : "lobby.roster.promote"
                    )}
                    onClick={() =>
                      onSetRole(
                        peer.peerId,
                        peer.role === "moderator" ? "viewer" : "moderator"
                      )
                    }
                  >
                    {peer.role === "moderator" ? "−" : "+"}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
