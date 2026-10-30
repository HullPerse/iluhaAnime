import { Checkbox } from "@/components/ui/checkbox.component";
import { Input } from "@/components/ui/input.component";
import Select from "@/components/ui/select.component";
import { SCREENSHOT_FORMATS, SCREENSHOT_FORMAT_LABELS } from "@/config/screenshot.config";
import { useI18n } from "@/hooks/i18n.hook";
import { useCell } from "@/lib/signal.hook";
import { patchSettings, settingsAtoms } from "@/store/settings.store";
import type { ScreenshotFormat } from "@/types/screenshot";

import { SectionResetButton } from "./reset.settings";

export default function ScreenshotSettings() {
  const screenshotDir = useCell(settingsAtoms.screenshotDir);
  const screenshotFormat = useCell(settingsAtoms.screenshotFormat);
  const screenshotOpenFolder = useCell(settingsAtoms.screenshotOpenFolder);
  const { t } = useI18n();

  return (
    <section className="ui-panel" data-find-section="general.screenshot">
      <div className="ui-titlebar group flex items-center justify-between gap-1">
        <span className="text-title-text font-bold">{t("settings.screenshot")}</span>
        <SectionResetButton sectionId="general.screenshot" />
      </div>
      <div className="flex flex-col gap-1 p-2">
        <label className="windows95-text text-text flex items-center gap-2 text-xs select-none">
          <span className="w-40 shrink-0 font-bold">{t("settings.screenshot.folder")}</span>
          <Input
            value={screenshotDir ?? ""}
            onChange={(e) => patchSettings({ screenshotDir: e.target.value || null })}
            placeholder={t("settings.screenshot.folder.hint")}
            className="flex-1"
          />
        </label>
        <label className="windows95-text text-text flex items-center gap-2 text-xs select-none">
          <span className="w-40 shrink-0 font-bold">{t("settings.screenshot.format")}</span>
          <Select
            value={screenshotFormat}
            onChange={(value) => patchSettings({ screenshotFormat: value as ScreenshotFormat })}
            options={SCREENSHOT_FORMATS.map((f) => ({
              value: f,
              label: t(SCREENSHOT_FORMAT_LABELS[f]),
            }))}
            className="h-6 flex-1"
          />
        </label>
        <label className="windows95-text text-text flex items-center gap-2 text-xs select-none">
          <span className="w-40 shrink-0 font-bold">{t("settings.screenshot.open.folder")}</span>
          <Checkbox
            checked={screenshotOpenFolder}
            onChange={() => patchSettings({ screenshotOpenFolder: !screenshotOpenFolder })}
          />
          <span>{t("settings.screenshot.open.folder")}</span>
        </label>
      </div>
    </section>
  );
}
