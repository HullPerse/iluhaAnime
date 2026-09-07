import { useState } from "react";

import { Button } from "@/components/ui/button.component";
import Combobox from "@/components/ui/combobox.component";
import { THEMES } from "@/config/settings/themes.config";
import { useI18n } from "@/lib/locale/i18n.utils";
import { useSettingsStore } from "@/store/settings.store";
import { useThemeStore, themeToJson, parseRetroismTheme } from "@/store/theme.store";
import type { ThemeDefinition } from "@/types/theme";

import { BackdropSlider } from "./theme/backdrop.theme";
import { ThemeCard } from "./theme/card.theme";
import ThemeEditor from "./theme/editor.theme";
import { EffectsCheckbox } from "./theme/effects.theme";
import { FontSelector } from "./theme/font.theme";

export default function SettingsTheme() {
  const { t } = useI18n();
  const currentTheme = useThemeStore((s) => s.currentTheme);
  const retroStyle = useSettingsStore((s) => s.retroStyle);
  const searchType = useSettingsStore((s) => s.searchType);
  const uiDensity = useSettingsStore((s) => s.uiDensity);
  const collectionGroupHeaderStyle = useSettingsStore((s) => s.collectionGroupHeaderStyle);
  const patchSettings = useSettingsStore((s) => s.patch);
  const customThemes = useThemeStore((s) => s.customThemes);
  const setTheme = useThemeStore((s) => s.setTheme);
  const removeCustomTheme = useThemeStore((s) => s.removeCustomTheme);
  const [showEditor, setShowEditor] = useState(false);
  const [editingTheme, setEditingTheme] = useState<ThemeDefinition | undefined>();
  const [importError, setImportError] = useState("");

  const builtins = THEMES;
  const currentDef = [...builtins, ...customThemes].find((t) => t.name === currentTheme);

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
      try {
        const text = await file.text();
        const theme = parseRetroismTheme(text);
        if (!theme) {
          setImportError(t("settings.theme.import.error"));
          return;
        }
        useThemeStore.getState().addCustomTheme(theme);
        setImportError("");
      } catch {
        setImportError(t("settings.theme.read.error"));
      }
    };
    input.click();
  };

  return (
    <div className="flex flex-col gap-3">
      <section className="ui-panel">
        <div className="ui-titlebar">
          <span className="font-bold text-white">{t("settings.theme")}</span>
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
          <span className="font-bold text-white">{t("settings.theme.retro.style")}</span>
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
              <span className="text-hint text-[12px]">{t("settings.theme.retro.style.hint")}</span>
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
              <span className="text-hint text-[12px]">{t("settings.theme.density.hint")}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="ui-panel">
        <div className="ui-titlebar">
          <span className="font-bold text-white">{t("settings.theme.collection.headers")}</span>
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
              <span className="text-hint text-[12px]">
                {t("settings.theme.collection.headers.hint")}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="ui-panel">
        <div className="ui-titlebar">
          <span className="font-bold text-white">{t("settings.font.title")}</span>
        </div>
        <div className="flex flex-col gap-1 p-2">
          <FontSelector />
        </div>
      </section>

      <section className="ui-panel">
        <div className="ui-titlebar">
          <span className="font-bold text-white">{t("settings.theme.effects")}</span>
        </div>
        <div className="flex flex-col gap-1 p-2">
          <EffectsCheckbox label={t("settings.theme.modal.animation")} field="modalAnimation" />
          <EffectsCheckbox label={t("settings.theme.3d.borders")} field="enable3dBorders" />
          <EffectsCheckbox label={t("settings.theme.button.press")} field="buttonPressEffect" />
          <EffectsCheckbox label={t("settings.theme.spinners")} field="enableAnimations" />
          <EffectsCheckbox label={t("settings.theme.scrollbar")} field="customScrollbar" />
          <BackdropSlider />

          {importError && <span className="text-destructive">{importError}</span>}
        </div>
      </section>

      <section className="ui-panel">
        <div className="ui-titlebar">
          <span className="font-bold text-white">{t("settings.theme.experimental")}</span>
        </div>

        <div className="flex flex-col gap-1 p-2">
          <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1.5">
            <span className="windows95-text text-text text-xs font-bold">
              {t("settings.theme.search")}
            </span>
            <div className="flex flex-col gap-1 p-2">
              <Combobox
                value={searchType}
                onChange={(value) => patchSettings({ searchType: value as typeof searchType })}
                options={[
                  { value: "default", label: t("settings.theme.search.default") },
                  { value: "modern", label: t("settings.theme.search.modern") },
                ]}
                className="max-w-xs"
              />
              <span className="text-hint text-[12px]">{t("settings.theme.search.hint")}</span>
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
