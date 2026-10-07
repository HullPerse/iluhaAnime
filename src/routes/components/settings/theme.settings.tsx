import { useState } from "react";

import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import Combobox from "@/components/ui/combobox.component";
import { Input } from "@/components/ui/input.component";
import Slider from "@/components/ui/range.component";
import { THEMES } from "@/config/settings/themes.config";
import { useI18n } from "@/hooks/i18n.hook";
import { useCell } from "@/lib/state/signal.hook";
import { windowTintAlpha } from "@/lib/theme/palette.utils";
import { attempt } from "@/lib/utils/attempt.utils";
import { patchSettings, settingsAtoms } from "@/store/settings.store";
import {
  addCustomTheme,
  parseRetroismTheme,
  removeCustomTheme,
  setTheme,
  themeAtoms,
  themeToJson,
} from "@/store/theme.store";
import type { ThemeDefinition } from "@/types/theme";

import { BackdropSlider } from "./theme/backdrop.theme";
import { ThemeCard } from "./theme/card.theme";
import ThemeEditor from "./theme/editor.theme";
import { EffectsCheckbox } from "./theme/effects.theme";
import { FontSelector } from "./theme/font.theme";

const TINT_SLIDER_MIN = 0.5;

export default function SettingsTheme() {
  const { t } = useI18n();
  const currentTheme = useCell(themeAtoms.currentTheme);
  const retroStyle = useCell(settingsAtoms.retroStyle);
  const searchType = useCell(settingsAtoms.searchType);
  const uiDensity = useCell(settingsAtoms.uiDensity);
  const windowEffect = useCell(settingsAtoms.windowEffect);
  const windowTintOpacity = useCell(settingsAtoms.windowTintOpacity);
  const collectionGroupHeaderStyle = useCell(settingsAtoms.collectionGroupHeaderStyle);
  const progressStyle = useCell(settingsAtoms.progressStyle);
  const themeSchedule = useCell(settingsAtoms.themeSchedule);
  const customThemes = useCell(themeAtoms.customThemes);
  const [showEditor, setShowEditor] = useState(false);
  const [editingTheme, setEditingTheme] = useState<ThemeDefinition | undefined>();
  const [importError, setImportError] = useState("");

  const builtins = THEMES;
  const currentDef = [...builtins, ...customThemes].find((t) => t.name === currentTheme);

  const tintFloor = currentDef
    ? windowTintAlpha(currentDef.colors.primary, currentDef.colors.text)
    : TINT_SLIDER_MIN;
  const tintValue = windowTintOpacity ?? tintFloor;
  const tintTooThin = tintValue < tintFloor;

  const handleExport = () => {
    if (!currentDef) return;
    const json = themeToJson(currentDef);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${currentDef.name}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const [text, textError] = await attempt(file.text());
      if (textError) {
        setImportError(t("settings.theme.read.error"));
        return;
      }
      const theme = parseRetroismTheme(text);
      if (!theme) {
        setImportError(t("settings.theme.import.error"));
        return;
      }
      addCustomTheme(theme);
      setImportError("");
    };
    input.click();
  };

  return (
    <div className="flex flex-col gap-3">
      <section className="ui-panel">
        <div className="ui-titlebar">
          <span className="text-title-text font-bold">{t("settings.theme")}</span>
        </div>
        <div className="flex flex-col gap-1 p-2">
          <div className="flex flex-wrap gap-2">
            {builtins.map((theme) => (
              <ThemeCard
                key={theme.name}
                theme={theme}
                isActive={currentTheme === theme.name}
                onSelect={() => setTheme(theme.name)}
              />
            ))}
            {customThemes.map((theme) => (
              <ThemeCard
                key={theme.name}
                theme={theme}
                isActive={currentTheme === theme.name}
                isCustom
                onSelect={() => setTheme(theme.name)}
                onEdit={() => {
                  setEditingTheme(theme);
                  setShowEditor(true);
                }}
                onDelete={() => removeCustomTheme(theme.name)}
              />
            ))}
          </div>

          <div className="mt-1 flex items-center gap-2">
            <Button
              onClick={() => {
                setEditingTheme(undefined);
                setShowEditor(true);
              }}
            >
              {t("settings.theme.create.title")}
            </Button>
            <Button onClick={handleImport}>{t("settings.theme.import")}</Button>
            {currentDef && <Button onClick={handleExport}>{t("settings.theme.export")}</Button>}
          </div>
        </div>
      </section>

      <section className="ui-panel">
        <div className="ui-titlebar">
          <span className="text-title-text font-bold">{t("settings.theme.schedule")}</span>
        </div>
        <div className="flex flex-col gap-1 p-2">
          <label className="windows95-text text-text flex cursor-pointer items-center gap-2 select-none">
            <Checkbox
              checked={themeSchedule.enabled}
              onChange={(v) => patchSettings({ themeSchedule: { ...themeSchedule, enabled: v } })}
            />
            {t("settings.theme.schedule.enable")}
          </label>
          <label className="windows95-text text-text flex items-center gap-2">
            <span className="w-48">{t("settings.theme.schedule.day")}</span>
            <Input
              type="time"
              className="w-28"
              value={themeSchedule.dayStart}
              onChange={(e) =>
                patchSettings({ themeSchedule: { ...themeSchedule, dayStart: e.target.value } })
              }
            />
            <span className="windows95-text text-text">-</span>
            <Input
              type="time"
              className="w-28"
              value={themeSchedule.nightStart}
              onChange={(e) =>
                patchSettings({ themeSchedule: { ...themeSchedule, nightStart: e.target.value } })
              }
            />
          </label>
          <label className="windows95-text text-text flex items-center gap-2">
            <span className="w-48">{t("settings.theme.schedule.day.theme")}</span>
            <Combobox
              className="max-w-xs"
              value={themeSchedule.dayTheme}
              onChange={(value) =>
                patchSettings({ themeSchedule: { ...themeSchedule, dayTheme: value } })
              }
              options={[...builtins, ...customThemes].map((theme) => ({
                value: theme.name,
                label: theme.label,
              }))}
            />
          </label>
          <label className="windows95-text text-text flex items-center gap-2">
            <span className="w-48">{t("settings.theme.schedule.night.theme")}</span>
            <Combobox
              className="max-w-xs"
              value={themeSchedule.nightTheme}
              onChange={(value) =>
                patchSettings({ themeSchedule: { ...themeSchedule, nightTheme: value } })
              }
              options={[...builtins, ...customThemes].map((theme) => ({
                value: theme.name,
                label: theme.label,
              }))}
            />
          </label>
        </div>
      </section>

      <section className="ui-panel">
        <div className="ui-titlebar">
          <span className="text-title-text font-bold">{t("settings.theme.retro.style")}</span>
        </div>
        <div className="flex flex-col gap-1 p-2">
          <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1.5">
            <span className="windows95-text text-text text-xs font-bold">
              {t("settings.theme.retro.style")}
            </span>
            <div className="flex flex-col gap-0.5">
              <Combobox
                value={retroStyle}
                onChange={(value) => patchSettings({ retroStyle: value as typeof retroStyle })}
                options={[
                  { value: "classic", label: t("settings.theme.retro.classic") },
                  { value: "soft", label: t("settings.theme.retro.soft") },
                  {
                    value: "high-contrast",
                    label: t("settings.theme.retro.contrast"),
                  },
                ]}
                className="max-w-xs"
              />
            </div>

            <span className="windows95-text text-text text-xs font-bold">
              {t("settings.theme.density")}
            </span>
            <div className="flex flex-col gap-0.5">
              <Combobox
                value={uiDensity}
                onChange={(value) => patchSettings({ uiDensity: value as typeof uiDensity })}
                options={[
                  {
                    value: "comfortable",
                    label: t("settings.theme.density.comfortable"),
                  },
                  { value: "compact", label: t("settings.theme.density.compact") },
                ]}
                className="max-w-xs"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="ui-panel">
        <div className="ui-titlebar">
          <span className="text-title-text font-bold">
            {t("settings.theme.collection.headers")}
          </span>
        </div>
        <div className="flex flex-col gap-1 p-2">
          <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1.5">
            <span className="windows95-text text-text text-xs font-bold">
              {t("settings.theme.collection.headers")}
            </span>
            <div className="flex flex-col gap-0.5">
              <Combobox
                value={collectionGroupHeaderStyle}
                onChange={(value) =>
                  patchSettings({
                    collectionGroupHeaderStyle: value as typeof collectionGroupHeaderStyle,
                  })
                }
                options={[
                  {
                    value: "torrent",
                    label: t("settings.theme.collection.headers.torrent"),
                  },
                  {
                    value: "folder",
                    label: t("settings.theme.collection.headers.folder"),
                  },
                ]}
                className="max-w-xs"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="ui-panel">
        <div className="ui-titlebar">
          <span className="text-title-text font-bold">{t("settings.progress.style")}</span>
        </div>
        <div className="flex flex-col gap-1 p-2">
          <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1.5">
            <span className="windows95-text text-text text-xs font-bold">
              {t("settings.progress.style")}
            </span>
            <div className="flex flex-col gap-0.5">
              <Combobox
                value={progressStyle}
                onChange={(value) =>
                  patchSettings({ progressStyle: value as typeof progressStyle })
                }
                options={[
                  { value: "blocks", label: t("settings.progress.style.blocks") },
                  { value: "solid", label: t("settings.progress.style.solid") },
                ]}
                className="max-w-xs"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="ui-panel">
        <div className="ui-titlebar">
          <span className="text-title-text font-bold">{t("settings.font.title")}</span>
        </div>
        <div className="flex flex-col gap-1 p-2">
          <FontSelector />
        </div>
      </section>

      <section className="ui-panel">
        <div className="ui-titlebar">
          <span className="text-title-text font-bold">{t("settings.theme.effects")}</span>
        </div>
        <div className="flex flex-col gap-1 p-2">
          <EffectsCheckbox label={t("settings.theme.modal.animation")} field="modalAnimation" />
          <EffectsCheckbox label={t("settings.theme.3d.borders")} field="enable3dBorders" />
          <EffectsCheckbox label={t("settings.theme.button.press")} field="buttonPressEffect" />
          <EffectsCheckbox label={t("settings.theme.spinners")} field="enableAnimations" />
          <EffectsCheckbox
            label={t("settings.theme.animated.counters")}
            field="animateCounters"
            hint={t("settings.theme.animated.counters.hint")}
          />
          <EffectsCheckbox label={t("settings.theme.scrollbar")} field="customScrollbar" />
          <BackdropSlider />

          {importError && <span className="text-destructive">{importError}</span>}
        </div>
      </section>

      <section className="ui-panel">
        <div className="ui-titlebar">
          <span className="text-title-text font-bold">{t("settings.theme.experimental")}</span>
        </div>

        <div className="flex flex-col gap-1 p-2">
          <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1.5">
            <span className="windows95-text text-text text-xs font-bold">
              {t("settings.theme.search")}
            </span>
            <Combobox
              value={searchType}
              onChange={(value) => patchSettings({ searchType: value as typeof searchType })}
              options={[
                { value: "default", label: t("settings.theme.search.default") },
                { value: "modern", label: t("settings.theme.search.modern") },
              ]}
              className="max-w-xs"
            />
          </div>
          <EffectsCheckbox
            label={t("settings.theme.experimental.mascot")}
            field="searchMascotEnabled"
          />
          <EffectsCheckbox
            label={t("settings.theme.experimental.statusbar")}
            field="statusBarEnabled"
          />
          <EffectsCheckbox
            label={t("settings.theme.experimental.titlebar")}
            field="customTitleBarEnabled"
          />
          <EffectsCheckbox
            label={t("settings.theme.experimental.corners")}
            field="roundedWindowCorners"
            hint={t("settings.theme.experimental.corners.hint")}
          />
          {currentTheme === "yorha" && (
            <EffectsCheckbox
              label={t("settings.theme.experimental.scanlines")}
              field="yorhaScanlinesEnabled"
            />
          )}
          <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-0.5">
            <span className="windows95-text text-text flex items-center text-xs font-bold">
              {t("settings.theme.experimental.effect")}
            </span>
            <div className="flex flex-col gap-0.5">
              <Combobox
                value={windowEffect}
                onChange={(value) => patchSettings({ windowEffect: value as typeof windowEffect })}
                label={t("settings.theme.experimental.effect")}
                options={[
                  { value: "none", label: t("settings.theme.experimental.effect.none") },
                  {
                    value: "acrylic",
                    label: t("settings.theme.experimental.effect.acrylic"),
                  },
                  { value: "mica", label: t("settings.theme.experimental.effect.mica") },
                  { value: "tabbed", label: t("settings.theme.experimental.effect.tabbed") },
                ]}
                className="max-w-xs"
              />
              <span className="text-hint text-[12px]">
                {t("settings.theme.experimental.effect.hint")}
              </span>
            </div>

            <span className="windows95-text text-text flex items-center text-xs font-bold">
              {t("settings.theme.experimental.effect.opacity")}
            </span>
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <Slider
                    min={TINT_SLIDER_MIN}
                    max={1}
                    step={0.05}
                    value={tintValue}
                    onChange={(value) => patchSettings({ windowTintOpacity: value })}
                    suffix="%"
                  />
                </div>
                <Button
                  variant="link"
                  disabled={windowTintOpacity === null}
                  onClick={() => patchSettings({ windowTintOpacity: null })}
                >
                  {t("settings.theme.experimental.effect.opacity.reset")}
                </Button>
              </div>
              {tintTooThin && (
                <span className="text-destructive text-[12px]">
                  {t("settings.theme.experimental.effect.opacity.warn")}
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {showEditor && (
        <ThemeEditor
          theme={editingTheme}
          onClose={() => {
            setShowEditor(false);
            setEditingTheme(undefined);
          }}
        />
      )}
    </div>
  );
}
