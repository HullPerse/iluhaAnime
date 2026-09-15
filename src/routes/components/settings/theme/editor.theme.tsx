import { cn } from "cn";
import { ImageUp, Wand2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { ColorPickerTrigger } from "@/components/ui/color/trigger.color";
import Combobox from "@/components/ui/combobox.component";
import { Input } from "@/components/ui/input.component";
import Slider from "@/components/ui/range.component";
import { THEME_COLOR_KEYS } from "@/config/settings/themes.config";
import { useI18n } from "@/lib/locale/i18n.utils";
import { buildThemeColors, readImagePalette } from "@/lib/theme/palette.utils";
import { applyTheme, getTitleText, useThemeStore } from "@/store/theme.store";
import type { ThemeColorKey, ThemeDefinition } from "@/types/theme";

const DEFAULT_COLORS: ThemeDefinition["colors"] = {
  autocomplete: "#808080",
  autocompleteOpacity: 0.6,
  background: "#222222",
  destructive: "#800000",
  field: "#ffffff",
  highlight: "#0000ff",
  linkHover: "#ff0000",
  muted: "#808080",
  primary: "#c0c0c0",
  secondary: "#000080",
  success: "#008000",
  surface: "#d0d0d0",
  text: "#000000",
  winHighlight: "#ffffff",
  winShadow: "#808080",
};

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
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(theme?.label ?? "");
  const [radius, setRadius] = useState<NonNullable<ThemeDefinition["radius"]>>(
    theme?.radius ?? "none"
  );
  const [bevel, setBevel] = useState<NonNullable<ThemeDefinition["bevel"]>>(
    theme?.bevel ?? "raised"
  );
  const [selected, setSelected] = useState<ThemeColorKey>("primary");
  const [palette, setPalette] = useState<string[]>([]);
  const [paletteFailed, setPaletteFailed] = useState(false);
  const [colors, setColors] = useState<ThemeDefinition["colors"]>(() => ({
    ...DEFAULT_COLORS,
    ...theme?.colors,
    autocomplete: theme?.colors.autocomplete ?? theme?.colors.muted ?? DEFAULT_COLORS.autocomplete,
    autocompleteOpacity: theme?.colors.autocompleteOpacity ?? DEFAULT_COLORS.autocompleteOpacity,
  }));

  useEffect(() => {
    if (!theme || currentTheme !== theme.name) return;
    applyTheme(theme.name, [
      { ...theme, bevel, colors, radius },
      ...customThemes.filter((item) => item.name !== theme.name),
    ]);
  }, [bevel, colors, currentTheme, customThemes, radius, theme]);

  const patchColor = (key: ThemeColorKey, value: string) =>
    setColors((prev) => ({ ...prev, [key]: value }));

  const handleFile = (file: File) => {
    const url = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      const found = readImagePalette(image);
      setPalette(found);
      setPaletteFailed(found.length === 0);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      setPalette([]);
      setPaletteFailed(true);
    };
    image.src = url;
  };

  const handleSave = () => {
    if (!name.trim()) return;
    const safeName = theme?.name ?? `custom-${name.trim().toLowerCase().replaceAll(/\s+/g, "-")}`;
    addCustomTheme({ bevel, colors: { ...colors }, label: name.trim(), name: safeName, radius });
    if (currentTheme === safeName) useThemeStore.getState().setTheme(safeName);
    onClose();
  };

  return (
    <Modal
      header={isEdit ? t("settings.theme.edit.title") : t("settings.theme.create.title")}
      onClose={onClose}
    >
      <div className="flex flex-col gap-3 p-2">
        <label className="windows95-text text-text flex items-center gap-2">
          <span className="w-24 shrink-0">{t("settings.theme.name")}</span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("settings.theme.name.placeholder")}
          />
        </label>

        <section className="windows95-border flex flex-col gap-1 p-1">
          <div className="flex items-center gap-1">
            <span className="windows95-text flex-1 text-xs font-bold">
              {t("settings.theme.palette")}
            </span>
            <Button className="h-5 px-1 text-xs" onClick={() => fileRef.current?.click()}>
              <ImageUp className="size-3" />
              {t("settings.theme.palette.load")}
            </Button>
            <Button
              className="h-5 px-1 text-xs"
              disabled={palette.length === 0}
              onClick={() => setColors((prev) => ({ ...prev, ...buildThemeColors(palette) }))}
            >
              <Wand2 className="size-3" />
              {t("settings.theme.palette.apply")}
            </Button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) handleFile(file);
            }}
          />
          {palette.length === 0 ? (
            <span className="windows95-text text-hint text-xs">
              {paletteFailed
                ? t("settings.theme.palette.error")
                : t("settings.theme.palette.empty")}
            </span>
          ) : (
            <div className="flex flex-wrap items-center gap-1">
              {palette.map((color) => (
                <button
                  key={color}
                  type="button"
                  title={color}
                  aria-label={color}
                  className="windows95-border size-6 cursor-pointer"
                  style={{ background: color }}
                  onClick={() => patchColor(selected, color)}
                />
              ))}
              <span className="windows95-text text-hint text-xs">
                {t("settings.theme.palette.hint")}
              </span>
            </div>
          )}
        </section>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          {THEME_COLOR_KEYS.map(({ key, label }) => {
            const value = colors[key] ?? colors.muted;
            return (
              <div
                key={key}
                className={cn(
                  "flex items-center gap-2 px-1",
                  selected === key && "bg-secondary/30"
                )}
              >
                <button
                  type="button"
                  aria-label={t(label)}
                  aria-pressed={selected === key}
                  className={cn(
                    "size-3 shrink-0 cursor-pointer",
                    selected === key ? "bg-highlight" : "bg-muted"
                  )}
                  onClick={() => setSelected(key)}
                />
                <span className="windows95-text text-text w-24 shrink-0 truncate">{t(label)}</span>
                <ColorPickerTrigger
                  value={value}
                  onChange={(v) => {
                    patchColor(key, v);
                    setSelected(key);
                  }}
                />
                <span className="text-hint font-mono text-xs">{value}</span>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          <div className="flex items-center gap-2 px-1">
            <span className="windows95-text text-text w-24 shrink-0 truncate">
              {t("settings.theme.shape.radius")}
            </span>
            <Combobox
              value={radius}
              onChange={(value) => setRadius(value as typeof radius)}
              options={[
                { value: "none", label: t("settings.theme.shape.radius.none") },
                { value: "frame", label: t("settings.theme.shape.radius.frame") },
                { value: "all", label: t("settings.theme.shape.radius.all") },
              ]}
              className="max-w-xs"
            />
          </div>
          <div className="flex items-center gap-2 px-1">
            <span className="windows95-text text-text w-24 shrink-0 truncate">
              {t("settings.theme.shape.bevel")}
            </span>
            <Combobox
              value={bevel}
              onChange={(value) => setBevel(value as typeof bevel)}
              options={[
                { value: "raised", label: t("settings.theme.shape.bevel.raised") },
                { value: "flat", label: t("settings.theme.shape.bevel.flat") },
              ]}
              className="max-w-xs"
            />
          </div>
        </div>

        <Slider
          label={t("settings.theme.autocomplete.opacity")}
          min={0}
          max={1}
          step={0.05}
          value={colors.autocompleteOpacity ?? 0.6}
          onChange={(value) => setColors((prev) => ({ ...prev, autocompleteOpacity: value }))}
          suffix="%"
        />

        <div
          className={cn(
            "windows95-border flex w-[340px] flex-col self-center",
            radius === "all" && "rounded-[5px]"
          )}
        >
          <div
            className={cn(
              "windows95-text px-1 text-xs font-bold",
              radius !== "none" && "rounded-t-[6px]"
            )}
            style={{
              background: `linear-gradient(to bottom, ${theme?.titlebarGradient?.from ?? colors.secondary}, ${theme?.titlebarGradient?.to ?? colors.secondary})`,
              color: getTitleText(colors.secondary),
            }}
          >
            {name.trim() || t("settings.theme.preview")}
          </div>
          <div
            className="flex flex-col gap-1 p-2"
            style={{ background: colors.primary, color: colors.text }}
          >
            <span className="windows95-text text-xs">{t("settings.theme.preview")}</span>
            <span
              className="windows95-text text-xs"
              style={{ color: colors.autocomplete, opacity: colors.autocompleteOpacity }}
            >
              {t("settings.theme.autocomplete.preview")}
            </span>
            <div className="flex flex-wrap items-center gap-1">
              <span
                className="windows95-border windows95-text px-1 text-xs"
                style={{ background: colors.surface, color: colors.text }}
              >
                {t("settings.theme.color.surface")}
              </span>
              <span
                className="windows95-text px-1 text-xs"
                style={{ background: colors.highlight, color: getTitleText(colors.highlight) }}
              >
                {t("settings.theme.color.highlight")}
              </span>
              <span className="windows95-text text-xs" style={{ color: colors.destructive }}>
                {t("settings.theme.color.destructive")}
              </span>
              <span className="windows95-text text-xs" style={{ color: colors.success }}>
                {t("settings.theme.color.success")}
              </span>
            </div>
          </div>
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
            {t("settings.theme.autocomplete.reset")}
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
