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
  const currentTheme = useThemeStore((s) => s.currentTheme);
  const retroStyle = useSettingsStore((s) => s.retroStyle);
  const uiDensity = useSettingsStore((s) => s.uiDensity);
  const collectionGroupHeaderStyle = useSettingsStore((s) => s.collectionGroupHeaderStyle);
  const patchSettings = useSettingsStore((s) => s.patch);
  const customThemes = useThemeStore((s) => s.customThemes);
  const setTheme = useThemeStore((s) => s.setTheme);
  const removeCustomTheme = useThemeStore((s) => s.removeCustomTheme);
  const { t: tr } = useI18n();
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
          setImportError(tr("settings.theme.import.error"));
          return;
        }
        useThemeStore.getState().addCustomTheme(theme);
        setImportError("");
      } catch {
        setImportError(tr("settings.theme.read.error"));
      }
    };
    input.click();
  };

  return (
    <div className="flex flex-col gap-3">
      <section className="ui-panel">
        <div className="ui-titlebar">
          <span className="font-bold text-white">{tr("settings.theme")}</span>
        </div>
        <div className="flex flex-col gap-1 p-2">
          <div className="flex flex-wrap gap-2">
            {builtins.map((t) => (
              <ThemeCard
                key={t.name}
                t={t}
                isActive={currentTheme === t.name}
                onSelect={() => setTheme(t.name)}
              />
            ))}
            {customThemes.map((t) => (
              <ThemeCard
                key={t.name}
                t={t}
                isActive={currentTheme === t.name}
                isCustom
                onSelect={() => setTheme(t.name)}
                onEdit={() => {
                  setEditingTheme(t);
                  setShowEditor(true);
                }}
                onDelete={() => removeCustomTheme(t.name)}
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
              {tr("settings.theme.create.title")}
            </Button>
            <Button onClick={handleImport}>{tr("settings.theme.import")}</Button>
            {currentDef && <Button onClick={handleExport}>{tr("settings.theme.export")}</Button>}
          </div>
        </div>
      </section>

      <section className="ui-panel">
        <div className="ui-titlebar">
          <span className="font-bold text-white">{tr("settings.theme.retro.style")}</span>
        </div>
        <div className="flex flex-col gap-1 p-2">
          <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1.5">
            <span className="windows95-text text-text text-xs font-bold">
              {tr("settings.theme.retro.style")}
            </span>
            <div className="flex flex-col gap-0.5">
              <Combobox
                value={retroStyle}
                onChange={(value) => patchSettings({ retroStyle: value as typeof retroStyle })}
                options={[
                  { value: "classic", label: tr("settings.theme.retro.classic") },
                  { value: "soft", label: tr("settings.theme.retro.soft") },
                  {
                    value: "high-contrast",
                    label: tr("settings.theme.retro.contrast"),
                  },
                ]}
                className="max-w-xs"
              />
              <span className="text-hint text-[12px]">{tr("settings.theme.retro.style.hint")}</span>
            </div>

            <span className="windows95-text text-text text-xs font-bold">
              {tr("settings.theme.density")}
            </span>
            <div className="flex flex-col gap-0.5">
              <Combobox
                value={uiDensity}
                onChange={(value) => patchSettings({ uiDensity: value as typeof uiDensity })}
                options={[
                  {
                    value: "comfortable",
                    label: tr("settings.theme.density.comfortable"),
                  },
                  { value: "compact", label: tr("settings.theme.density.compact") },
                ]}
                className="max-w-xs"
              />
              <span className="text-hint text-[12px]">{tr("settings.theme.density.hint")}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="ui-panel">
        <div className="ui-titlebar">
          <span className="font-bold text-white">{tr("settings.theme.collection.headers")}</span>
        </div>
        <div className="flex flex-col gap-1 p-2">
          <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1.5">
            <span className="windows95-text text-text text-xs font-bold">
              {tr("settings.theme.collection.headers")}
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
                    label: tr("settings.theme.collection.headers.torrent"),
                  },
                  {
                    value: "folder",
                    label: tr("settings.theme.collection.headers.folder"),
                  },
                ]}
                className="max-w-xs"
              />
              <span className="text-hint text-[12px]">
                {tr("settings.theme.collection.headers.hint")}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="ui-panel">
        <div className="ui-titlebar">
          <span className="font-bold text-white">{tr("settings.font.title")}</span>
        </div>
        <div className="flex flex-col gap-1 p-2">
          <FontSelector />
        </div>
      </section>

      <section className="ui-panel">
        <div className="ui-titlebar">
          <span className="font-bold text-white">{tr("settings.theme.effects")}</span>
        </div>
        <div className="flex flex-col gap-1 p-2">
          <EffectsCheckbox label={tr("settings.theme.modal.animation")} field="modalAnimation" />
          <EffectsCheckbox label={tr("settings.theme.3d.borders")} field="enable3dBorders" />
          <EffectsCheckbox label={tr("settings.theme.button.press")} field="buttonPressEffect" />
          <EffectsCheckbox label={tr("settings.theme.spinners")} field="enableAnimations" />
          <EffectsCheckbox label={tr("settings.theme.scrollbar")} field="customScrollbar" />
          <BackdropSlider />

          {importError && <span className="text-destructive">{importError}</span>}
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
