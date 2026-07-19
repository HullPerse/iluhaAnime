import { useState } from "react";
import {
  useThemeStore,
  themeToJson,
  parseRetroismTheme,
} from "@/store/theme.store";
import { useSettingsStore, type SettingsStore } from "@/store/settings.store";
import { THEMES } from "@/config/themes.config";
import { Button } from "@/components/ui/button.component";
import Slider from "@/components/ui/range.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import ThemeEditor from "./editor.settings";
import type { ThemeDefinition } from "@/types/theme";

function ThemeCard({
  t,
  isActive,
  isCustom,
  onSelect,
  onDelete,
}: {
  t: ThemeDefinition;
  isActive: boolean;
  isCustom?: boolean;
  onSelect: () => void;
  onDelete?: () => void;
}) {
  const c = t.colors;
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        className={`flex flex-col items-center gap-1 p-2 windows95-active-border bg-primary cursor-pointer focus-visible:outline-dotted focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-text ${
          isActive ? "ring-2 ring-inset ring-text" : ""
        }`}
        onClick={onSelect}
        title={t.label}
      >
        <div className="flex gap-0.5">
          <div
            className="size-5 border border-muted"
            style={{ background: c.primary }}
            title="Фон"
          />
          <div
            className="size-5 border border-muted"
            style={{ background: c.secondary }}
            title="Акцент"
          />
          <div
            className="size-5 border border-muted"
            style={{ background: c.text }}
            title="Текст"
          />
          <div
            className="size-5 border border-muted"
            style={{ background: c.winHighlight }}
            title="Светлая кромка"
          />
          <div
            className="size-5 border border-muted"
            style={{ background: c.winShadow }}
            title="Тёмная кромка"
          />
        </div>
        <span className="windows95-text text-text text-[10px]">
          {t.label}
          {isCustom && " (польз.)"}
        </span>
      </button>
      {isCustom && onDelete && (
        <Button
          className="text-[9px] underline"
          variant="destructive"
          size="default"
          onClick={onDelete}
        >
          удалить
        </Button>
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
      <label className="flex items-center gap-2 windows95-text text-text cursor-pointer select-none">
      <Checkbox checked={value} onChange={(v) => patch({ [field]: v })} />
      <span>{label}</span>
    </label>
  );
}

function BackdropSlider() {
  const value = useSettingsStore((s) => s.modalBackdropOpacity);
  const patch = useSettingsStore((s) => s.patch);
  return (
    <div className="windows95-text font-bold">
      <Slider
        label="Затемнение фона"

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
  const customThemes = useThemeStore((s) => s.customThemes);
  const setTheme = useThemeStore((s) => s.setTheme);
  const removeCustomTheme = useThemeStore((s) => s.removeCustomTheme);
  const [showEditor, setShowEditor] = useState(false);
  const [importError, setImportError] = useState("");

  const builtins = THEMES;
  const currentDef = [...builtins, ...customThemes].find(
    (t) => t.name === currentTheme,
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
          setImportError("Не удалось распарсить файл");
          return;
        }
        useThemeStore.getState().addCustomTheme(theme);
        setImportError("");
      } catch {
        setImportError("Ошибка чтения файла");
      }
    };
    input.click();
  };

  return (
    <div className="flex flex-col gap-3 p-4">
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
            onDelete={() => removeCustomTheme(t.name)}
          />
        ))}
      </div>

      <div className="flex items-center gap-2 mt-1">
        <Button onClick={() => setShowEditor(true)}>Создать тему</Button>
        <Button onClick={handleImport}>Импорт</Button>
        {currentDef && <Button onClick={handleExport}>Экспорт</Button>}
      </div>

      <hr className="windows95-header w-full my-2" />

      <p className="windows95-text text-muted font-bold w-full">
        Визуальные эффекты
      </p>

      <EffectsCheckbox label="Анимация модальных окон" field="modalAnimation" />
      <EffectsCheckbox
        label="3D-рамки на модальных окнах"
        field="enable3dBorders"
      />
      <EffectsCheckbox
        label="Эффект нажатия на кнопки"
        field="buttonPressEffect"
      />
      <EffectsCheckbox
        label="Анимация загрузки (спиннеры)"
        field="enableAnimations"
      />
      <EffectsCheckbox label="Скроллбар (Win95)" field="customScrollbar" />
      <BackdropSlider />

      {importError && (
        <span className="windows95-text text-destructive">{importError}</span>
      )}

      {showEditor && <ThemeEditor onClose={() => setShowEditor(false)} />}
    </div>
  );
}
