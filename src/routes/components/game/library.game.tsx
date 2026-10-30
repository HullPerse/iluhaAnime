import { cn } from "cn";
import { Gamepad2, Play, Store, Trash2, Upload } from "lucide-react";
import type { KeyboardEvent } from "react";

import { SmallLoader } from "@/components/shared/loader.component";
import { Button } from "@/components/ui/button.component";
import { GAME_PLATFORM_LABELS } from "@/config/platforms.config";
import { useI18n } from "@/hooks/i18n.hook";
import { sizeInKb } from "@/lib/gameFormat.utils";
import { moveIndex } from "@/lib/keyboard.utils";
import type { GameRomInfo } from "@/types/game";

export interface GameLibraryProps {
  roms: GameRomInfo[];
  activeId: string | null;
  /** ROM being started right now; its row shows a spinner instead of an idle Play. */
  startingId: string | null;
  importPending: boolean;
  deletingId: string | null;
  loading: boolean;
  error: string | null;
  onImport: () => void;
  onOpenStore: () => void;
  onPlay: (rom: GameRomInfo) => void;
  onDelete: (rom: GameRomInfo) => void;
  onReload: () => void;
}

export default function GameLibrary({
  roms,
  activeId,
  startingId,
  importPending,
  deletingId,
  loading,
  error,
  onImport,
  onOpenStore,
  onPlay,
  onDelete,
  onReload,
}: GameLibraryProps) {
  const { t } = useI18n();

  /**
   * Rows take real DOM focus, so the current position comes straight from the
   * focused row; no extra state. Arrow keys move between rows, Home/End jump,
   * Enter on a row plays it, and Enter on its action buttons stays theirs.
   */
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const rows = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[data-rom-row]"));
    if (rows.length === 0) return;
    const target = event.target;
    const targetRow =
      target instanceof HTMLElement ? target.closest<HTMLElement>("[data-rom-row]") : null;
    const current = targetRow === null ? -1 : rows.indexOf(targetRow);

    if (event.key === "Enter") {
      if (target instanceof HTMLElement && target.tagName === "BUTTON") return;
      const rom = roms[current];
      if (rom !== undefined) {
        event.preventDefault();
        onPlay(rom);
      }
      return;
    }

    const delta = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    const boundary = event.key === "Home" ? 0 : event.key === "End" ? rows.length - 1 : null;
    if (delta === 0 && boundary === null) return;
    event.preventDefault();
    const next = boundary ?? moveIndex(current, delta, rows.length);
    rows[next]?.focus();
  };

  return (
    <section className="windows95-border bg-surface flex min-h-0 w-72 shrink-0 flex-col">
      <header className="windows95-active-border bg-primary flex items-center gap-1 px-1 py-0.5">
        <Gamepad2 aria-hidden className="size-3" />
        <span className="windows95-text text-xs font-bold">{t("game.library.title")}</span>
        <Button className="ml-auto h-5 gap-0.5 px-1 text-xs" onClick={onOpenStore}>
          <Store aria-hidden className="size-3" />
          {t("game.store.open")}
        </Button>
        <Button className="h-5 gap-0.5 px-1 text-xs" onClick={onImport} loading={importPending}>
          <Upload aria-hidden className="size-3" />
          {t("game.import")}
        </Button>
      </header>
      <div
        className="flex min-h-0 flex-1 flex-col overflow-y-auto p-1"
        role="list"
        aria-label={t("game.library.title")}
        onKeyDown={handleKeyDown}
      >
        {loading && (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 p-2">
            <SmallLoader size={5} />
            <span className="text-hint text-xs">{t("common.loading")}</span>
          </div>
        )}
        {error !== null && (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 p-2 text-center">
            <span className="text-destructive text-xs">{error}</span>
            <Button className="h-5 px-2 text-xs" onClick={onReload}>
              {t("game.retry")}
            </Button>
          </div>
        )}
        {!loading && error === null && roms.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 p-2 text-center">
            <Gamepad2 aria-hidden className="text-hint size-6" />
            <span className="windows95-text text-xs font-bold">{t("game.empty.title")}</span>
            <span className="text-hint text-xs">{t("game.empty.body")}</span>
          </div>
        )}
        {error === null &&
          roms.map((rom) => {
            const active = rom.id === activeId;
            return (
              <div
                key={rom.id}
                data-rom-row
                role="listitem"
                aria-current={active ? "true" : undefined}
                tabIndex={-1}
                className={cn(
                  "focus-visible:outline-text flex items-center gap-1 px-1 py-0.5 focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-dotted",
                  active ? "bg-highlight" : "hover:bg-field"
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className={cn("truncate text-xs font-bold", active && "text-white")}>
                    {rom.name}
                  </div>
                  <div className={cn("text-hint truncate text-xs", active && "text-white/80")}>
                    {t(GAME_PLATFORM_LABELS[rom.platform])}
                    {" - "}
                    {t(rom.source === "builtin" ? "game.source.builtin" : "game.source.user")}
                    {" - "}
                    {t("game.size.kb", { value: sizeInKb(rom.size) })}
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  title={t("game.play")}
                  aria-label={t("game.play")}
                  loading={startingId === rom.id}
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
