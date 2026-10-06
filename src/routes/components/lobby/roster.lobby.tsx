import { openUrl } from "@tauri-apps/plugin-opener";
import { cn } from "cn";
import { useState } from "react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { usePeerAvatarUrl } from "@/hooks/session/avatar.hook";
import type { TranslationKey } from "@/types/i18n";
import type { LobbyRole, PeerInfo } from "@/types/session";

interface RosterLobbyProps {
  peers: PeerInfo[];
  className?: string;
  lobbyRole?: LobbyRole | null;
  /** Omit to hide the promote/demote controls. */
  onSetRole?: (peerId: string, role: LobbyRole) => void;
  /** Peer id → missing-item count (badge). */
  missingByPeer?: Record<string, number>;
}

function avatarLetter(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed.charAt(0).toUpperCase() : "?";
}

function anilistProfileUrl(userId: number): string {
  return `https://anilist.co/user/${userId}`;
}

function openAniListProfile(userId: number): void {
  openUrl(anilistProfileUrl(userId)).catch((error: unknown) => {
    console.warn("[lobby] open AniList profile failed", error);
  });
}

function roleKey(role: LobbyRole): TranslationKey {
  return role === "host" ? "lobby.roster.host" : "lobby.roster.moderator";
}

/** Letter tile fallback; no request without id. */
function PeerAvatarCell({ peer }: { peer: PeerInfo }) {
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);
  const anilistUserId = peer.anilistUserId;
  const avatarUrl = usePeerAvatarUrl(anilistUserId);
  const letter = avatarLetter(peer.displayName);
  if (anilistUserId === null) {
    return (
      <span
        aria-hidden
        className="windows95-border bg-primary text-text windows95-text flex size-6 shrink-0 items-center justify-center font-bold"
      >
        {letter}
      </span>
    );
  }
  const handleImageError = () => setFailed(true);
  const openProfile = () => openAniListProfile(anilistUserId);
  if (failed || avatarUrl === null) {
    return (
      <button
        aria-label={t("lobby.roster.anilistProfile")}
        className="windows95-border bg-primary text-text windows95-text flex size-6 shrink-0 cursor-pointer items-center justify-center font-bold"
        title={t("lobby.roster.anilistProfile")}
        type="button"
        onClick={openProfile}
      >
        {letter}
      </button>
    );
  }
  return (
    <button
      aria-label={t("lobby.roster.anilistProfile")}
      className="windows95-border bg-primary text-text windows95-text flex size-6 shrink-0 cursor-pointer items-center justify-center font-bold"
      title={t("lobby.roster.anilistProfile")}
      type="button"
      onClick={openProfile}
    >
      <img
        alt={t("lobby.roster.avatar", { name: peer.displayName })}
        className="size-6 object-cover"
        src={avatarUrl}
        onError={handleImageError}
      />
    </button>
  );
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
            {peers.map((peer) => {
              return (
                <li
                  className={cn(
                    "flex items-center gap-2 p-1",
                    peer.left && "opacity-60"
                  )}
                  key={peer.peerId}
                >
                <PeerAvatarCell peer={peer} />
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
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
