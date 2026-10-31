import { useState } from "react";

import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import Select from "@/components/ui/select.component";
import { GAME_PLATFORM_LABELS } from "@/config/system/platforms.config";
import { useI18n } from "@/hooks/i18n.hook";
import type { GamePlatform } from "@/types/core/game";
import type { GameImportModalProps } from "@/types/core/import.game";

export default function GameImportModal({
  filePath,
  platforms,
  busy,
  onConfirm,
  onClose,
}: GameImportModalProps) {
  const { t } = useI18n();
  const [platform, setPlatform] = useState<GamePlatform>("chip8");
  const [name, setName] = useState<string>("");
  const fileName = filePath.split(/[\\/]/u).pop() ?? filePath;
  const options = platforms.map((value) => ({
    value,
    label: t(GAME_PLATFORM_LABELS[value]),
  }));

  return (
    <Modal header={t("game.import.title")} onClose={onClose} className="w-md">
      <div className="flex flex-col gap-2 p-2">
        <div className="flex flex-col gap-0.5">
          <span className="windows95-text text-xs font-bold">{t("game.import.file")}</span>
          <span
            className="windows95-border bg-field windows95-text truncate px-1 py-0.5 text-xs"
            title={filePath}
          >
            {fileName}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="windows95-text text-xs font-bold">{t("game.import.platform")}</span>
          <Select
            value={platform}
            onChange={(value) => setPlatform(value as GamePlatform)}
            options={options}
            label={t("game.import.platform")}
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="windows95-text text-xs font-bold">{t("game.import.name")}</span>
          <Input
            value={name}
            placeholder={t("game.import.name.placeholder")}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="flex justify-end gap-1">
          <Button
            onClick={() => onConfirm({ path: filePath, platform, name: name.trim() || undefined })}
            loading={busy}
          >
            {t("game.import.confirm")}
          </Button>
          <Button disabled={busy} onClick={onClose}>
            {t("common.cancel")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
