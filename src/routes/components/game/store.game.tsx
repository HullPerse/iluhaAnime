import { Download } from "lucide-react";
import { useState } from "react";

import Modal from "@/components/shared/modal.component";
import ProgressBar from "@/components/shared/progress.component";
import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import Select from "@/components/ui/select.component";
import { GAME_STORE_PLATFORM_LABELS, GAME_STORE_PLATFORMS } from "@/config/platforms.config";
import { useGameStore, useGameStoreInstall } from "@/hooks/game/store.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { sizeInKb } from "@/lib/gameFormat.utils";
import { useOnlineStatus } from "@/hooks/network.hook";
import { useTauriEvent } from "@/hooks/tauriEvent.hook";
import { attempt } from "@/lib/attempt.utils";
import { showError } from "@/lib/notification.utils";
import type { GameStoreEntry, GameStorePlatform, GameStoreProgress } from "@/types/game";

const ALL_PLATFORMS = "all";

type PlatformFilter = GameStorePlatform | typeof ALL_PLATFORMS;

export interface GameStoreModalProps {
  onClose: () => void;
}

export default function GameStoreModal({ onClose }: GameStoreModalProps) {
  const { t } = useI18n();
  const online = useOnlineStatus();
  const store = useGameStore();
  const install = useGameStoreInstall();
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState<PlatformFilter>(ALL_PLATFORMS);
  const [progress, setProgress] = useState<GameStoreProgress | null>(null);

  useTauriEvent<GameStoreProgress>("game-store-progress", (event) => {
    setProgress(event.payload);
  });

  const entries = store.data ?? [];
  const normalized = query.trim().toLowerCase();
  const visible = entries.filter((entry) => {
    if (platform !== ALL_PLATFORMS && entry.platform !== platform) return false;
    if (normalized.length === 0) return true;
    return (
      entry.title.toLowerCase().includes(normalized) ||
      entry.authors.join(" ").toLowerCase().includes(normalized)
    );
  });
  const installingKey = install.isPending ? (install.variables ?? null) : null;
  const options = [
    { value: ALL_PLATFORMS, label: t("game.store.all") },
    ...GAME_STORE_PLATFORMS.map((value) => ({
      value,
      label: t(GAME_STORE_PLATFORM_LABELS[value]),
    })),
  ];

  const handleInstall = async (entry: GameStoreEntry) => {
    setProgress(null);
    const [, error] = await attempt(install.mutateAsync(entry.key));
    if (error !== null) {
      showError(t("common.error"), t("game.store.install.error"));
    }
  };

  return (
    <Modal header={t("game.store.title")} onClose={onClose} className="w-2xl">
      <div className="flex items-center gap-1">
        <Input
          value={query}
          placeholder={t("game.store.search")}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="w-40 shrink-0">
          <Select
            value={platform}
            onChange={(value) => setPlatform(value as PlatformFilter)}
            options={options}
            label={t("game.store.filter")}
          />
        </div>
      </div>
      {!store.isLoading && store.error === null && entries.length > 0 && (
        <span className="text-hint text-xs">
          {t("game.store.count", { shown: visible.length, total: entries.length })}
        </span>
      )}
      {!online && <span className="text-hint text-xs">{t("game.store.offline")}</span>}
      {store.isLoading && <span className="text-hint text-xs">{t("common.loading")}</span>}
      {store.error !== null && (
        <span className="text-destructive text-xs">{t("game.store.error")}</span>
      )}
      {!store.isLoading && store.error === null && visible.length === 0 && (
        <span className="text-hint text-xs">{t("game.store.empty")}</span>
      )}
      <div className="flex max-h-[50vh] min-h-0 flex-col overflow-y-auto">
        {visible.map((entry) => {
          const installing = installingKey === entry.key;
          const rowProgress = progress !== null && progress.key === entry.key ? progress : null;
          return (
            <div key={entry.key} className="flex items-center gap-2 px-1 py-0.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-bold">{entry.title}</div>
                <div className="text-hint truncate text-xs">
                  {t(GAME_STORE_PLATFORM_LABELS[entry.platform])}
                  {" - "}
                  {t("game.store.by", { authors: entry.authors.join(", ") })}
                  {" - "}
                  {t("game.size.kb", { value: sizeInKb(entry.size) })}
                </div>
                <div className="text-hint truncate text-xs" title={entry.description}>
                  {entry.description}
                </div>
                {entry.howto !== null && (
                  <div className="text-hint truncate text-xs" title={entry.howto}>
                    {t("game.controls", { hint: entry.howto })}
                  </div>
                )}
              </div>
              {entry.installed && (
                <span className="windows95-text text-success shrink-0 text-xs">
                  {t("game.store.installed")}
                </span>
              )}
              {!entry.installed && installing && (
                <ProgressBar
                  value={rowProgress?.received ?? 0}
                  max={rowProgress?.total ?? entry.size}
                  indeterminate={rowProgress === null || rowProgress.received === 0}
                  className="h-3 w-24 shrink-0"
                  ariaLabel={t("game.store.downloading")}
                />
              )}
              {!entry.installed && !installing && (
                <Button
                  className="h-5 gap-0.5 px-1"
                  disabled={!online || install.isPending}
                  onClick={() => handleInstall(entry)}
                >
                  <Download aria-hidden className="size-3" />
                  {t("game.store.download")}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
