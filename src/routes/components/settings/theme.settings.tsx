import { cn } from "@/lib/index.utils";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import Combobox from "@/components/ui/combobox.component";
import Slider from "@/components/ui/range.component";
import { THEMES } from "@/config/themes.config";
import { useI18n } from "@/lib/i18n";
import { useSettingsStore } from "@/store/settings.store";
import { useThemeStore, themeToJson, parseRetroismTheme } from "@/store/theme.store";
import type { SettingsStore } from "@/types/settings";
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
        className={cn("windows95-active-border bg-primary focus-visible:outline-text flex cursor-pointer flex-col items-center gap-1 p-2 focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-dotted", isActive && "ring-text ring-2 ring-inset")}
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
            title={tr("settings.theme.color.win.highlight")}
          />
          <div
            className="border-muted size-5 border"
            style={{ background: c.winShadow }}
            title={tr("settings.theme.color.win.shadow")}
          />
        </div>
        <span className="windows95-text text-text text-xs">
          {t.label}
          {isCustom && tr("settings.theme.custom")}
        </span>
      </button>
      {isCustom && (onEdit || onDelete) && (
        <div className="flex gap-1">
          {onEdit && (
            <Button className="text-xs underline" size="default" onClick={onEdit}>
              {tr("settings.theme.edit")}
            </Button>
          )}
          {onDelete && (
            <Button
              className="text-xs underline"
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

function EffectsCheckbox({ label, field }: { label: string; field: keyof SettingsStore }) {
  const value = useSettingsStore((s) => s[field] as boolean);
  const patch = useSettingsStore((s) => s.patch);
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-0.5">
      <span className="windows95-text text-text flex items-center text-xs font-bold">{label}</span>
      <label className="windows95-text text-text flex cursor-pointer items-center gap-2 select-none">
        <Checkbox checked={value} onChange={(v) => patch({ [field]: v })} />
        <span className="text-xs">{value ? t("common.on") : t("common.off")}</span>
      </label>
    </div>
  );
}

function BackdropSlider() {
  const value = useSettingsStore((s) => s.modalBackdropOpacity);
  const patch = useSettingsStore((s) => s.patch);
  const { t: tr } = useI18n();
  return (
    <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-0.5">
      <span className="windows95-text text-text flex items-center text-xs font-bold">
        {tr("settings.theme.backdrop")}
      </span>
      <Slider
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

function FontSelector() {
  const appFont = useSettingsStore((s) => s.appFont);
  const patch = useSettingsStore((s) => s.patch);
  const { t } = useI18n();
  const [fonts, setFonts] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("systemFontsCache");
      if (raw) {
        const parsed = JSON.parse(raw) as { fonts: string[]; ts: number };
        if (
          Array.isArray(parsed.fonts) &&
          typeof parsed.ts === "number" &&
          Date.now() - parsed.ts < 7 * 24 * 60 * 60 * 1000
        )
          return parsed.fonts;
      }
    } catch {}
    return [];
  });
  const [loading, setLoading] = useState(fonts.length === 0);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (fonts.length > 0) return;
    let cancelled = false;
    setLoading(true);
    invoke<string[]>("list_system_fonts")
      .then((list) => {
        if (cancelled) return;
        setFonts(list);
        setLoading(false);
        try {
          localStorage.setItem("systemFontsCache", JSON.stringify({ fonts: list, ts: Date.now() }));
        } catch {}
      })
      .catch(() => {
        if (!cancelled) {
          setError(t("settings.font.load.error"));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [fonts.length, t]);
  type FontOption = {
    value: string;
    label: string;
    style?: React.CSSProperties;
  };
  const options = useMemo(() => {
    const base: FontOption[] = [];
    const seen = new Set<string>();
    const push = (value: string, label: string, style?: React.CSSProperties) => {
      if (seen.has(value.toLowerCase())) return;
      seen.add(value.toLowerCase());
      base.push({ value, label, style });
    };
    push("iluhaAnime", "iluhaAnime", { fontFamily: '"iluhaAnime"' });
    push("", t("settings.font.default"));
    for (const f of fonts) {
      const escaped = f.replace(/"/g, '\\"');
      push(f, f, { fontFamily: `"${escaped}"` });
    }
    return base;
  }, [fonts, t]);
  if (loading && fonts.length === 0) {
    return (
      <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-0.5">
        <span className="windows95-text text-text flex items-center text-xs font-bold">
          {t("settings.font.title")}
        </span>
        <div className="flex flex-col gap-0.5">
          <span className="text-hint text-[12px]">{t("settings.font.hint")}</span>
          <span className="text-hint text-[12px]">{t("common.loading")}</span>
          {error && <span className="text-destructive text-[12px]">{error}</span>}
        </div>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-0.5">
      <span className="windows95-text text-text flex items-center text-xs font-bold">
        {t("settings.font.title")}
      </span>
      <div className="flex flex-col gap-0.5">
        <span className="text-hint text-[12px]">{t("settings.font.hint")}</span>
        <Combobox
          value={appFont ?? ""}
          onChange={(v) => patch({ appFont: v || null })}
          options={options}
          indexed
          className="max-w-xs"
        />
        {error && <span className="text-destructive text-[12px]">{error}</span>}
      </div>
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
    <div className="flex flex-col gap-3 p-2 sm:p-4">
      {/* Style and density */}
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

      <FontSelector />

      {/* Theme cards */}
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

      <hr className="border-muted my-2 w-full border-t" />

      {/* Effects */}
      <span className="windows95-text text-text text-xs font-bold">
        {tr("settings.theme.effects")}
      </span>

      <EffectsCheckbox label={tr("settings.theme.modal.animation")} field="modalAnimation" />
      <EffectsCheckbox label={tr("settings.theme.3d.borders")} field="enable3dBorders" />
      <EffectsCheckbox label={tr("settings.theme.button.press")} field="buttonPressEffect" />
      <EffectsCheckbox label={tr("settings.theme.spinners")} field="enableAnimations" />
      <EffectsCheckbox label={tr("settings.theme.scrollbar")} field="customScrollbar" />
      <BackdropSlider />

      {importError && <span className="text-destructive">{importError}</span>}

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
