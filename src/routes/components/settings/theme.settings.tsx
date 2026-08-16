import { useState } from "react";

import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import Slider from "@/components/ui/range.component";
import Select from "@/components/ui/select.component";
import { THEMES } from "@/config/themes.config";
import { useI18n } from "@/lib/i18n";
import { useSettingsStore } from "@/store/settings.store";
import type { SettingsStore } from "@/types/settings";
import {
  useThemeStore,
  themeToJson,
  parseRetroismTheme,
} from "@/store/theme.store";
import type { ThemeDefinition } from "@/types/theme";

import ThemeEditor from "./theme.editor";

function ThemeCard({
  t,
  isActive,
  isCustom,
  onSelect,
  onDelete,
  onEdit,
}: {
  t: ThemeDefinition;
  isActive: boolean;
  isCustom?: boolean;
  onSelect: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
}) {
  const c = t.colors;
  const { t: tr } = useI18n();
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        className={`windows95-active-border bg-primary focus-visible:outline-text flex cursor-pointer flex-col items-center gap-1 p-2 focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-dotted ${
          isActive ? "ring-text ring-2 ring-inset" : ""
        }`}
        onClick={onSelect}
        title={t.label}
        aria-pressed={isActive}
      >
        <div className="flex gap-0.5">
          <div
            className="border-muted size-5 border"
            style={{ background: c.primary }}
            title={tr("settings.theme.color.primary")}
          />
          <div
            className="border-muted size-5 border"
            style={{ background: c.secondary }}
            title={tr("settings.theme.color.secondary")}
          />
          <div
            className="border-muted size-5 border"
            style={{ background: c.text }}
            title={tr("settings.theme.color.text")}
          />
          <div
            className="border-muted size-5 border"
            style={{ background: c.winHighlight }}
            title={tr("settings.theme.color.winHighlight")}
          />
          <div
            className="border-muted size-5 border"
            style={{ background: c.winShadow }}
            title={tr("settings.theme.color.winShadow")}
          />
        </div>
        <span className="windows95-text text-text text-[10px]">
          {t.label}
          {isCustom && tr("settings.theme.custom")}
        </span>
      </button>
      {isCustom && (onEdit || onDelete) && (
        <div className="flex gap-1">
          {onEdit && (
            <Button
              className="text-[9px] underline"
              size="default"
              onClick={onEdit}
            >
              {tr("settings.theme.edit")}
            </Button>
          )}
          {onDelete && (
            <Button
              className="text-[9px] underline"
              variant="destructive"
              size="default"
              onClick={onDelete}
            >
              {tr("settings.theme.delete")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function EffectsCheckbox({
  label,
  field,
}: {
  label: string;
  field: keyof SettingsStore;
}) {
  const value = useSettingsStore((s) => s[field] as boolean);
  const patch = useSettingsStore((s) => s.patch);
  return (
    <label className="windows95-text text-text flex cursor-pointer items-center gap-2 select-none">
      <Checkbox checked={value} onChange={(v) => patch({ [field]: v })} />
      <span>{label}</span>
    </label>
  );
}

function BackdropSlider() {
  const value = useSettingsStore((s) => s.modalBackdropOpacity);
  const patch = useSettingsStore((s) => s.patch);
  const { t: tr } = useI18n();
  return (
    <div className="windows95-text font-bold">
      <Slider
        label={tr("settings.theme.backdrop")}

        min={0}
        max={100}
        step={5}
        value={value}
        onChange={(v) => patch({ modalBackdropOpacity: v })}
        suffix="%"
      />
    </div>
  );
}

export default function SettingsTheme() {
  const currentTheme = useThemeStore((s) => s.currentTheme);
  const retroStyle = useSettingsStore((s) => s.retroStyle);
  const uiDensity = useSettingsStore((s) => s.uiDensity);
  const patchSettings = useSettingsStore((s) => s.patch);
  const customThemes = useThemeStore((s) => s.customThemes);
  const setTheme = useThemeStore((s) => s.setTheme);
  const removeCustomTheme = useThemeStore((s) => s.removeCustomTheme);
  const { t: tr } = useI18n();
  const [showEditor, setShowEditor] = useState(false);
  const [editingTheme, setEditingTheme] = useState<ThemeDefinition | undefined>();
  const [importError, setImportError] = useState("");

  const builtins = THEMES;
  const currentDef = [...builtins, ...customThemes].find(
    (t) => t.name === currentTheme
  );

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
          setImportError(tr("settings.theme.importError"));
          return;
        }
        useThemeStore.getState().addCustomTheme(theme);
        setImportError("");
      } catch {
        setImportError(tr("settings.theme.readError"));
      }
    };
    input.click();
  };

  return (
    <div className="flex flex-col gap-3 p-2 sm:p-4">
      <section className="ui-panel flex flex-col gap-2 p-2">
        <div className="flex flex-col gap-0.5">
          <span className="windows95-text text-text font-bold">
            {tr("settings.theme.retroStyle")}
          </span>
          <span className="windows95-text text-muted text-[10px]">
            {tr("settings.theme.retroStyleHint")}
          </span>
        </div>
        <Select
          value={retroStyle}
          onChange={(value) =>
            patchSettings({ retroStyle: value as typeof retroStyle })
          }
          options={[
            { value: "classic", label: tr("settings.theme.retroClassic") },
            { value: "soft", label: tr("settings.theme.retroSoft") },
            {
              value: "high-contrast",
              label: tr("settings.theme.retroContrast"),
            },
          ]}
          className="max-w-xs"
        />
        <div className="flex flex-col gap-0.5">
          <span className="windows95-text text-text font-bold">
            {tr("settings.theme.density")}
          </span>
          <span className="windows95-text text-muted text-[10px]">
            {tr("settings.theme.densityHint")}
          </span>
        </div>
        <Select
          value={uiDensity}
          onChange={(value) =>
            patchSettings({ uiDensity: value as typeof uiDensity })
          }
          options={[
            {
              value: "comfortable",
              label: tr("settings.theme.densityComfortable"),
            },
            { value: "compact", label: tr("settings.theme.densityCompact") },
          ]}
          className="max-w-xs"
        />
      </section>
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
          {tr("settings.theme.createTitle")}
        </Button>
        <Button onClick={handleImport}>{tr("settings.theme.import")}</Button>
        {currentDef && (
          <Button onClick={handleExport}>{tr("settings.theme.export")}</Button>
        )}
      </div>

      <hr className="windows95-header my-2 w-full" />

      <p className="windows95-text text-muted w-full font-bold">
        {tr("settings.theme.effects")}
      </p>

      <EffectsCheckbox
        label={tr("settings.theme.modalAnimation")}
        field="modalAnimation"
      />
      <EffectsCheckbox
        label={tr("settings.theme.3dBorders")}
        field="enable3dBorders"
      />
      <EffectsCheckbox
        label={tr("settings.theme.buttonPress")}
        field="buttonPressEffect"
      />
      <EffectsCheckbox
        label={tr("settings.theme.spinners")}
        field="enableAnimations"
      />
      <EffectsCheckbox
        label={tr("settings.theme.scrollbar")}
        field="customScrollbar"
      />
      <BackdropSlider />

      {importError && (
        <span className="windows95-text text-destructive">{importError}</span>
      )}

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
