import { useEffect, useState } from "react";

import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { ColorPickerTrigger } from "@/components/ui/color.component";
import { Input } from "@/components/ui/input.component";
import Slider from "@/components/ui/range.component";
import { useI18n } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n";
import { applyTheme, useThemeStore } from "@/store/theme.store";
import type { ThemeDefinition } from "@/types/theme";

type ThemeColorKey = Exclude<
  keyof ThemeDefinition["colors"],
  "autocompleteOpacity"
>;

const COLOR_KEYS: {
  key: ThemeColorKey;
  label: TranslationKey;
}[] = [
  { key: "background", label: "settings.theme.color.background" },
  { key: "primary", label: "settings.theme.color.primary" },
  { key: "secondary", label: "settings.theme.color.secondary" },
  { key: "text", label: "settings.theme.color.text" },
  { key: "muted", label: "settings.theme.color.muted" },
  { key: "autocomplete", label: "settings.theme.color.autocomplete" },
  { key: "highlight", label: "settings.theme.color.highlight" },
  { key: "destructive", label: "settings.theme.color.destructive" },
  { key: "success", label: "settings.theme.color.success" },
  { key: "surface", label: "settings.theme.color.surface" },
  { key: "winHighlight", label: "settings.theme.color.winHighlight" },
  { key: "winShadow", label: "settings.theme.color.winShadow" },
];

export default function ThemeEditor({
  theme,
  onClose,
}: {
  theme?: ThemeDefinition;
  onClose: () => void;
}) {
  const addCustomTheme = useThemeStore((s) => s.addCustomTheme);
  const currentTheme = useThemeStore((s) => s.currentTheme);
  const customThemes = useThemeStore((s) => s.customThemes);
  const { t } = useI18n();
  const isEdit = !!theme;
  const defaults: ThemeDefinition["colors"] = {
    background: "#222222",
    primary: "#c0c0c0",
    secondary: "#000080",
    text: "#000000",
    muted: "#808080",
    autocomplete: "#808080",
    autocompleteOpacity: 0.6,
    highlight: "#0000ff",
    destructive: "#800000",
    success: "#008000",
    linkHover: "#ff0000",
    surface: "#d0d0d0",
    winHighlight: "#ffffff",
    winShadow: "#808080",
  };

  const [name, setName] = useState(theme?.label ?? "");
  const [colors, setColors] = useState<ThemeDefinition["colors"]>(() => ({
    ...defaults,
    ...theme?.colors,
    autocomplete:
      theme?.colors.autocomplete ??
      theme?.colors.muted ??
      defaults.autocomplete,
    autocompleteOpacity:
      theme?.colors.autocompleteOpacity ?? defaults.autocompleteOpacity,
  }));

  useEffect(() => {
    if (!theme || currentTheme !== theme.name) return;
    applyTheme(theme.name, [
      { ...theme, colors },
      ...customThemes.filter((item) => item.name !== theme.name),
    ]);
  }, [colors, currentTheme, customThemes, theme]);

  const patchColor = (key: ThemeColorKey, value: string) =>
    setColors((prev) => ({ ...prev, [key]: value }));

  const handleSave = () => {
    if (!name.trim()) return;
    const safeName =
      theme?.name ??
      `custom-${name.trim().toLowerCase().replaceAll(/\s+/g, "-")}`;
    const nextTheme = {
      name: safeName,
      label: name.trim(),
      colors: { ...colors },
    };
    addCustomTheme(nextTheme);
    if (currentTheme === safeName) {
      useThemeStore.getState().setTheme(safeName);
    }
    onClose();
  };

  return (
    <Modal
      header={
        isEdit ? t("settings.theme.editTitle") : t("settings.theme.createTitle")
      }
      onClose={onClose}
    >
      <div className="flex flex-col gap-3 p-2">
        <label className="windows95-text text-text flex items-center gap-2">
          <span className="w-24 shrink-0">{t("settings.theme.name")}</span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("settings.theme.namePlaceholder")}
          />
        </label>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {COLOR_KEYS.map(({ key, label }) => (
            <label
              key={key}
              className="windows95-text text-text flex items-center gap-2"
            >
              <span className="w-28 shrink-0">{t(label)}</span>
              <ColorPickerTrigger
                value={colors[key] ?? colors.muted}
                onChange={(v) => patchColor(key, v)}
              />
              <span className="text-muted font-mono text-[10px]">
                {colors[key] ?? colors.muted}
              </span>
            </label>
          ))}
        </div>

        <Slider
          label={t("settings.theme.autocompleteOpacity")}
          min={0}
          max={1}
          step={0.05}
          value={colors.autocompleteOpacity ?? 0.6}
          onChange={(value) =>
            setColors((prev) => ({ ...prev, autocompleteOpacity: value }))
          }
          suffix="%"
        />

        {/* Live preview */}
        <div
          className="windows95-border flex items-center justify-center self-center"
          style={{ width: 300, height: 60, background: colors.primary }}
        >
          <span
            className="windows95-text px-1 py-0.5 font-bold"
            style={{
              background: colors.secondary,
              color: colors.text,
            }}
          >
            {name.trim() || t("settings.theme.preview")}
          </span>
          <span
            className="windows95-text ml-2"
            style={{
              color: colors.autocomplete,
              opacity: colors.autocompleteOpacity,
            }}
          >
            {t("settings.theme.autocompletePreview")}
          </span>
        </div>

        <div className="mt-1 flex justify-end gap-1">
          <Button
            onClick={() =>
              setColors((prev) => ({
                ...prev,
                autocomplete: prev.muted,
                autocompleteOpacity: 0.6,
              }))
            }
          >
            {t("settings.theme.autocompleteReset")}
          </Button>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={handleSave} disabled={!name.trim()}>
            {t("settings.theme.save")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
