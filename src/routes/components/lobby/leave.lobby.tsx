import { useState } from "react";

import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import Select from "@/components/ui/select.component";
import { useI18n } from "@/hooks/i18n.hook";
import type { PeerInfo } from "@/types/session";

export interface LeaveLobbyProps {
  open: boolean;
  candidates: PeerInfo[];
  leavePending: boolean;
  transferPending: boolean;
  onClose: () => void;
  onLeave: () => void;
  /** Rejoin as a viewer. */
  onTransfer: (peerId: string) => void;
}

/** Host-only leave dialog; hierarchy pick like crash promotion. */
export default function LeaveLobby({
  open,
  candidates,
  leavePending,
  transferPending,
  onClose,
  onLeave,
  onTransfer,
}: LeaveLobbyProps) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<string | null>(null);
  const pending = leavePending || transferPending;

  if (!open) return null;

  const chosen =
    selected !== null && candidates.some((peer) => peer.peerId === selected)
      ? selected
      : (candidates[0]?.peerId ?? null);

  return (
    <Modal
      header={t("lobby.leave.title")}
      onClose={onClose}
      className="w-xl"
    >
      <div className="flex flex-col gap-2 py-2">
        <span className="windows95-text">{t("lobby.leave.question")}</span>
        {candidates.length > 0 && (
          <>
            <span className="windows95-text text-hint text-xs">
              {t("lobby.leave.hint")}
            </span>
            <Select
              value={chosen ?? ""}
              onChange={setSelected}
              options={candidates.map((peer) => ({
                value: peer.peerId,
                label: peer.displayName,
              }))}
              label={t("lobby.leave.transferTo")}
            />
          </>
        )}
        <div className="mt-2 flex justify-end gap-1">
          <Button disabled={pending} onClick={onLeave}>
            {t("lobby.leave.close")}
          </Button>
          {candidates.length > 0 && (
            <Button
              disabled={pending || chosen === null}
              onClick={() => {
                if (chosen !== null) onTransfer(chosen);
              }}
            >
              {t("lobby.leave.transfer")}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
