import { confirm as confirmDialog, open as openDialog } from "@tauri-apps/plugin-dialog";
import { useRef, useState } from "react";

import { useGameRomMutations, useGamePlatforms, useGameRoms } from "@/hooks/game/roms.hook";
import { useIntegerScale } from "@/hooks/game/scale.hook";
import { useGameSession } from "@/hooks/game/session.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { GAME_PLATFORMS } from "@/config/game/platforms.config";
import { attempt, reportBackgroundError } from "@/lib/utils/attempt.utils";
import { showError } from "@/lib/utils/notification.utils";
import GameImportModal from "@/routes/components/game/import.game";
import type { GameImportDraft } from "@/routes/components/game/import.game";
import GameLibrary from "@/routes/components/game/library.game";
import GameScreen from "@/routes/components/game/screen.game";
import GameStoreModal from "@/routes/components/game/store.game";
import type { GameRomInfo } from "@/types/game";

const ROM_FILTERS = [{ name: "Chip-8", extensions: ["ch8", "c8", "sc8", "bin"] }];

export default function GameRoute() {
  const { t } = useI18n();
  const roms = useGameRoms();
  const platforms = useGamePlatforms();
  const { importRom, deleteRom } = useGameRomMutations();
  const [muted, setMuted] = useState(false);
  const [draftPath, setDraftPath] = useState<string | null>(null);
  const [storeOpen, setStoreOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const session = useGameSession({ canvas: canvasRef, muted });

  const info = session.runtime.info;
  const cols = info !== null && session.telemetry.hires ? 128 : 64;
  const rows = cols === 128 ? 64 : 32;
  const scale = useIntegerScale(stageRef, cols, rows);

  const handlePlay = async (rom: GameRomInfo) => {
    await session.start(rom);
  };

  const handleStop = (): void => {
    session.stop();
  };

  const handleImport = async () => {
    const [selected, error] = await attempt(
      openDialog({ multiple: false, directory: false, filters: ROM_FILTERS })
    );
    if (error !== null) {
      reportBackgroundError("game.import.pick", error);
      return;
    }
    if (typeof selected !== "string") return;
    setDraftPath(selected);
  };

  const handleConfirmImport = async (draft: GameImportDraft) => {
    const [, error] = await attempt(
      importRom.mutateAsync({ name: draft.name, path: draft.path, platform: draft.platform })
    );
    if (error !== null) {
      showError(t("common.error"), t("game.import.error"));
      return;
    }
    setDraftPath(null);
  };

  const handleDelete = async (rom: GameRomInfo) => {
    const [confirmed, error] = await attempt(
      confirmDialog(t("game.delete.body", { name: rom.name }), {
        kind: "warning",
        title: t("game.delete.title"),
      })
    );
    if (error !== null) {
      reportBackgroundError("game.delete.confirm", error);
      return;
    }
    if (confirmed !== true) return;
    if (session.runtime.info?.id === rom.id) session.stop();
    const [, deleteError] = await attempt(deleteRom.mutateAsync(rom.id));
    if (deleteError !== null) showError(t("common.error"), t("game.delete.error"));
  };

  return (
    <div className="flex h-full min-h-0 gap-2 p-2">
      <GameLibrary
        roms={roms.data ?? []}
        activeId={info?.id ?? null}
        importPending={importRom.isPending}
        deletingId={deleteRom.isPending ? (deleteRom.variables ?? null) : null}
        loading={roms.isLoading}
        error={roms.error !== null ? roms.error.message : null}
        onImport={handleImport}
        onOpenStore={() => setStoreOpen(true)}
        onPlay={handlePlay}
        onDelete={handleDelete}
      />
      <GameScreen
        runtime={session.runtime}
        telemetry={session.telemetry}
        muted={muted}
        cols={cols}
        rows={rows}
        scale={scale}
        stageRef={stageRef}
        canvasRef={canvasRef}
        onStop={handleStop}
        onToggleMute={() => setMuted((current) => !current)}
      />
      {storeOpen && <GameStoreModal onClose={() => setStoreOpen(false)} />}
      {draftPath !== null && (
        <GameImportModal
          filePath={draftPath}
          platforms={platforms.data ?? GAME_PLATFORMS}
          busy={importRom.isPending}
          onConfirm={handleConfirmImport}
          onClose={() => setDraftPath(null)}
        />
      )}
    </div>
  );
}
