import { cn } from "cn";
import { Gamepad2, Play, Store, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { GAME_PLATFORM_LABELS } from "@/config/game/platforms.config";
import { useI18n } from "@/hooks/i18n.hook";
import type { GameRomInfo } from "@/types/game";

export interface GameLibraryProps {
  roms: GameRomInfo[];
  activeId: string | null;
  importPending: boolean;
  deletingId: string | null;
  loading: boolean;
  error: string | null;
  onImport: () => void;
  onOpenStore: () => void;
  onPlay: (rom: GameRomInfo) => void;
  onDelete: (rom: GameRomInfo) => void;
}

function sizeInKb(bytes: number): number {
  return Math.max(1, Math.ceil(bytes / 1024));
}

export default function GameLibrary({
  roms,
  activeId,
  importPending,
  deletingId,
  loading,
  error,
  onImport,
  onOpenStore,
  onPlay,
  onDelete,
}: GameLibraryProps) {
  const { t } = useI18n();

  return (
    <section className="windows95-border bg-surface flex w-72 min-h-0 shrink-0 flex-col">
      <header className="windows95-active-border bg-primary flex items-center gap-1 px-1 py-0.5">
        <Gamepad2 aria-hidden className="size-3" />
        <span className="windows95-text text-xs font-bold">{t("game.library.title")}</span>
        <Button
          className="ml-auto h-5 gap-0.5 px-1 text-xs"
          onClick={onOpenStore}
        >
          <Store aria-hidden className="size-3" />
          {t("game.store.open")}
        </Button>
        <Button
          className="h-5 gap-0.5 px-1 text-xs"
          onClick={onImport}
          loading={importPending}
        >
          <Upload aria-hidden className="size-3" />
          {t("game.import")}
        </Button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-1">
        {loading && <span className="text-hint p-1 text-xs">{t("common.loading")}</span>}
        {error !== null && <span className="text-destructive p-1 text-xs">{error}</span>}
        {!loading && error === null && roms.length === 0 && (
          <span className="text-hint p-1 text-xs">{t("game.empty.body")}</span>
        )}
        {roms.map((rom) => {
          const active = rom.id === activeId;
          return (
            <div
              key={rom.id}
              className={cn("flex items-center gap-1 px-1 py-0.5", active && "bg-highlight")}
            >
              <div className="min-w-0 flex-1">
                <div className={cn("truncate text-xs font-bold", active && "text-white")}>
                  {rom.name}
                </div>
                <div
                  className={cn(
                    "text-hint truncate text-xs",
                    active && "text-white/80"
                  )}
                >
                  {t(GAME_PLATFORM_LABELS[rom.platform])}
                  {" · "}
                  {t(rom.source === "builtin" ? "game.source.builtin" : "game.source.user")}
                  {" · "}
                  {t("game.size.kb", { value: sizeInKb(rom.size) })}
                </div>
              </div>
              <Button
                size="icon"
                variant="ghost"
                title={t("game.play")}
                aria-label={t("game.play")}
                onClick={() => onPlay(rom)}
              >
                <Play aria-hidden className="size-3" />
              </Button>
              {rom.source === "user" && (
                <Button
                  size="icon"
                  variant="ghost"
                  title={t("game.delete")}
                  aria-label={t("game.delete")}
                  loading={deletingId === rom.id}
                  onClick={() => onDelete(rom)}
                >
                  <Trash2 aria-hidden className="size-3" />
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
