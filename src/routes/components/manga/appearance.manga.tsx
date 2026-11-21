import { useCell } from "@hullperse/hp_utils/react";

import Select from "@/components/ui/select.component";
import { useI18n } from "@/hooks/i18n.hook";
import { patchSettings, settingsAtoms } from "@/store/settings.store";

const frameDesigns = ["none", "dark", "light", "shadow", "win95", "gold", "inset"] as const;

export function ReaderFrameControl() {
  const { t } = useI18n();
  const current = useCell(settingsAtoms.mangaReaderFrame);
  return (
    <div className="grid gap-1.5">
      <span>{t("manga.reader.frame")}</span>
      <Select
        label={t("manga.reader.frame")}
        value={current}
        onChange={(mangaReaderFrame) => patchSettings({ mangaReaderFrame })}
        options={frameDesigns.map((value) => ({
          value,
          label: t(`manga.reader.frame.${value}`),
        }))}
      />
    </div>
  );
}
