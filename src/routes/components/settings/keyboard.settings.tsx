import Select from "@/components/ui/select.component";
import { useI18n } from "@/hooks/i18n.hook";
import { useCell } from "@/lib/core/signal.hook";
import { patchSettings, settingsAtoms } from "@/store/settings.store";

import { SectionResetButton } from "@/routes/components/settings/reset.settings";

export function KeyboardSettings() {
  const vimMode = useCell(settingsAtoms.vimMode);
  const { t } = useI18n();
  return (
    <section className="ui-panel" data-find-section="general.keyboard">
      <div className="ui-titlebar group flex items-center justify-between gap-1">
        <span className="text-title-text font-bold">{t("settings.keyboard")}</span>
        <SectionResetButton sectionId="general.keyboard" />
      </div>
      <div className="flex flex-col gap-1 p-2">
        <div className="grid grid-cols-1 gap-x-3 gap-y-1.5 min-[560px]:grid-cols-[140px_1fr]">
          <span className="windows95-text text-text flex items-center text-xs font-bold">
            {t("settings.vim.mode")}
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-hint text-[12px]">{t("settings.vim.mode.hint")}</span>
            <Select
              value={vimMode ? "on" : "off"}
              onChange={(value) => patchSettings({ vimMode: value === "on" })}
              options={[
                { value: "off", label: t("common.off") },
                { value: "on", label: t("common.on") },
              ]}
              className="w-32"
              label={t("settings.vim.mode")}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
