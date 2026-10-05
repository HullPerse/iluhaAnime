import { useEffect, useRef } from "react";

import { sessionApi } from "@/api/session.api";
import type { TorrentInfoResult } from "@/api/torrent.api";
import { useI18n } from "@/hooks/i18n.hook";
import { useTauriEvent } from "@/hooks/tauriEvent.hook";
import { joinSavePath, pickVerifyFile } from "@/lib/session/download.utils";
import { analyzeCompatibility } from "@/lib/session/match.utils";
import { attempt, toError } from "@/lib/utils/attempt.utils";
import { ignore } from "@/lib/utils/promise.utils";
import { showError, showInfo, showWarning } from "@/lib/utils/notification.utils";
import { useSettingsStore } from "@/store/settings.store";
import type { CompatibilityReport, MediaPlanItem } from "@/types/session";
import type { TorrentInfo } from "@/types/torrent";

/** A started host-torrent download tracked against one plan item. */
export interface SessionDownloadLink {
  itemId: string;
  saveDir: string;
  subFolder: string | null;
  files: TorrentInfoResult["files"];
  /** Download selection at start; `null` means everything. */
  selected: number[] | null;
}

/**
 * Auto-verify (§14.6): when a tracked host-torrent download finishes, hash
 * the downloaded file (byte-size match first, else the largest selected
 * video) and compare it with the plan item identity. A match assigns the
 * file exactly like a manual pick, so the existing ready report flips the
 * item to verified; a mismatch warns and leaves a re-download offer in the
 * row instead of assigning the file.
 */
export function useSessionDownloadVerify(input: {
  enabled: boolean;
  plan: MediaPlanItem[];
  onVerifyStart: (itemId: string) => void;
  onVerifyDone: (itemId: string) => void;
  onVerified: (itemId: string, path: string, report: CompatibilityReport) => void;
  onMismatch: (itemId: string, path: string, report: CompatibilityReport) => void;
}): { trackDownload: (torrentId: number, link: SessionDownloadLink) => void } {
  const { t } = useI18n();
  const planRef = useRef(input.plan);
  const callbacksRef = useRef({
    onMismatch: input.onMismatch,
    onVerified: input.onVerified,
    onVerifyDone: input.onVerifyDone,
    onVerifyStart: input.onVerifyStart,
  });
  useEffect(() => {
    planRef.current = input.plan;
    callbacksRef.current = {
      onMismatch: input.onMismatch,
      onVerified: input.onVerified,
      onVerifyDone: input.onVerifyDone,
      onVerifyStart: input.onVerifyStart,
    };
  });

  const linksRef = useRef(new Map<number, SessionDownloadLink>());
  const previousRef = useRef<TorrentInfo[]>([]);

  useTauriEvent<TorrentInfo[]>(
    "torrents-update",
    (event) => {
      const previous = previousRef.current;
      previousRef.current = event.payload;
      for (const torrent of event.payload) {
        if (!torrent.finished) continue;
        if (previous.some((entry) => entry.id === torrent.id && entry.finished)) continue;
        const link = linksRef.current.get(torrent.id);
        if (!link) continue;
        linksRef.current.delete(torrent.id);
        callbacksRef.current.onVerifyStart(link.itemId);
        ignore(verifyDownload(torrent, link));
      }
    },
    { enabled: input.enabled, errorTag: "session-verify" }
  );

  async function verifyDownload(torrent: TorrentInfo, link: SessionDownloadLink): Promise<void> {
    const done = () => callbacksRef.current.onVerifyDone(link.itemId);
    const item = planRef.current.find((entry) => entry.itemId === link.itemId);
    if (!item) {
      done();
      return;
    }
    const extensions = useSettingsStore.getState().videoExtensions;
    const file = pickVerifyFile(link.files, item.identity.size, extensions, link.selected);
    if (!file) {
      showError(t("lobby.error.title"), t("lobby.playlist.download.noFiles"));
      done();
      return;
    }
    const path = joinSavePath(torrent.save_dir || link.saveDir, link.subFolder, file.name);
    const [identity, identityError] = await attempt(sessionApi.mediaIdentity(path));
    if (identityError || !identity) {
      showError(t("lobby.error.title"), identityError ? toError(identityError).message : path);
      done();
      return;
    }
    const report = analyzeCompatibility(item.identity, identity);
    if (report.level === "exact" || report.level === "compatible") {
      callbacksRef.current.onVerified(link.itemId, path, report);
      showInfo(
        t("lobby.playlist.download.verified"),
        t("lobby.playlist.download.verifiedHint", { title: item.title })
      );
    } else {
      callbacksRef.current.onMismatch(link.itemId, path, report);
      showWarning(
        t("lobby.playlist.download.mismatch"),
        t("lobby.playlist.download.mismatchHint", { title: item.title })
      );
    }
    done();
  }

  return {
    trackDownload: (torrentId: number, link: SessionDownloadLink) => {
      linksRef.current.set(torrentId, link);
    },
  };
}
