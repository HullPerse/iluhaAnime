import { cn } from "cn";
import { ImageUp, Wand2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import { ColorPickerTrigger } from "@/components/ui/color/trigger.color";
import Combobox from "@/components/ui/combobox.component";
import { Input } from "@/components/ui/input.component";
import Slider from "@/components/ui/range.component";
import { DEFAULT_THEME_COLORS, THEME_COLOR_KEYS } from "@/config/settings/themes.config";
import { useI18n } from "@/hooks/i18n.hook";
import { useCell } from "@/lib/state/signal.hook";
import { buildThemeColors, readImagePalette } from "@/lib/theme/palette.utils";
import {
  addCustomTheme,
  applyTheme,
  getTitleText,
  setTheme,
  themeAtoms,
} from "@/store/theme.store";
import type { TranslationKey } from "@/types/i18n";
import type {
  ThemeColorKey,
  ThemeComponents,
  ThemeDefinition,
  ThemeOverrideKey,
} from "@/types/theme";

const DEFAULT_COLORS: ThemeDefinition["colors"] = { ...DEFAULT_THEME_COLORS };

const OVERRIDE_ROWS: {
  key: ThemeOverrideKey;
  label: TranslationKey;
  fallback: (colors: ThemeDefinition["colors"]) => string;
}[] = [
  { key: "progressMain", label: "settings.theme.override.progress", fallback: (c) => c.secondary },
  {
    key: "torrentDownloading",
    label: "settings.theme.override.torrent.downloading",
    fallback: () => "#0000ff",
  },
  {
    key: "torrentSeeding",
    label: "settings.theme.override.torrent.seeding",
    fallback: () => "#f97316",
  },
  {
    key: "torrentDone",
    label: "settings.theme.override.torrent.done",
    fallback: () => "#008000",
  },
  {
    key: "torrentError",
    label: "settings.theme.override.torrent.error",
    fallback: () => "#800000",
  },
  {
    key: "torrentInitializing",
    label: "settings.theme.override.torrent.initializing",
    fallback: () => "#0891b2",
  },
  {
    key: "torrentIdle",
    label: "settings.theme.override.torrent.idle",
    fallback: () => "#808080",
  },
  {
    key: "torrentMissing",
    label: "settings.theme.override.torrent.missing",
    fallback: () => "#b8860b",
  },
];

function OverrideRow({
  label,
  value,
  isCustom,
  onPick,
  onReset,
}: {
  label: TranslationKey;
  value: string;
  isCustom: boolean;
  onPick: (value: string) => void;
  onReset: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2 px-1">
      <span className="windows95-text text-text w-24 shrink-0 truncate">{t(label)}</span>
      <ColorPickerTrigger value={value} onChange={onPick} />
      <span className="text-hint font-mono text-xs">{value}</span>
      {isCustom && (
        <Button variant="link" className="text-xs" onClick={onReset}>
          {t("settings.theme.override.reset")}
        </Button>
      )}
    </div>
  );
}

function OverridesSection({
  colors,
  overrides,
  onPick,
  onReset,
}: {
  colors: ThemeDefinition["colors"];
  overrides: ThemeDefinition["overrides"];
  onPick: (key: ThemeOverrideKey, value: string) => void;
  onReset: (key: ThemeOverrideKey) => void;
}) {
  const { t } = useI18n();
  return (
    <section className="windows95-border mt-1 flex flex-col gap-1 p-1">
      <span className="windows95-text text-xs font-bold">{t("settings.theme.overrides")}</span>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {OVERRIDE_ROWS.map((row) => (
          <OverrideRow
            key={row.key}
            label={row.label}
            value={overrides?.[row.key] ?? row.fallback(colors)}
            isCustom={overrides?.[row.key] !== undefined}
            onPick={(value) => onPick(row.key, value)}
            onReset={() => onReset(row.key)}
          />
        ))}
      </div>
    </section>
  );
}

function ThemePreview({
  name,
  radius,
  colors,
  gradient,
}: {
  name: string;
  radius: NonNullable<ThemeDefinition["radius"]>;
  colors: ThemeDefinition["colors"];
  gradient: ThemeDefinition["titlebarGradient"];
}) {
  const { t } = useI18n();
  return (
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
          background: `linear-gradient(to bottom, ${gradient?.from ?? colors.secondary}, ${gradient?.to ?? colors.secondary})`,
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
  );
}

function buildComponents(
  titlebarArt: boolean,
  cardMeta: NonNullable<ThemeComponents["cardMeta"]>
): ThemeComponents | undefined {
  const components: ThemeComponents = {};
  if (titlebarArt) components.titlebarArt = true;
  if (cardMeta !== "full") components.cardMeta = cardMeta;
  return Object.keys(components).length > 0 ? components : undefined;
}

export default function ThemeEditor({
  theme,
  onClose,
}: {
  theme?: ThemeDefinition;
  onClose: () => void;
}) {
  const currentTheme = useCell(themeAtoms.currentTheme);
  const customThemes = useCell(themeAtoms.customThemes);
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
  const [overlay, setOverlay] = useState<NonNullable<ThemeDefinition["overlay"]>>(
    theme?.overlay ?? "none"
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
  const [overrides, setOverrides] = useState<ThemeDefinition["overrides"]>(() => ({
    ...theme?.overrides,
  }));
  const [titlebarArt, setTitlebarArt] = useState(theme?.components?.titlebarArt === true);
  const [cardMeta, setCardMeta] = useState<NonNullable<ThemeComponents["cardMeta"]>>(
    theme?.components?.cardMeta ?? "full"
  );

  useEffect(() => {
    if (!theme || currentTheme !== theme.name) return;
    applyTheme(theme.name, [
      {
        ...theme,
        bevel,
        colors,
        components: buildComponents(titlebarArt, cardMeta),
        overlay,
        overrides,
        radius,
      },
      ...customThemes.filter((item) => item.name !== theme.name),
    ]);
  }, [
    bevel,
    cardMeta,
    colors,
    currentTheme,
    customThemes,
    overlay,
    overrides,
    radius,
    theme,
    titlebarArt,
  ]);

  const patchColor = (key: ThemeColorKey, value: string) =>
    setColors((prev) => ({ ...prev, [key]: value }));

  const patchOverride = (key: ThemeOverrideKey, value: string) =>
    setOverrides((prev) => ({ ...prev, [key]: value }));

  const resetOverride = (key: ThemeOverrideKey) =>
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });

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
    const savedOverrides =
      overrides && Object.keys(overrides).length > 0 ? { ...overrides } : undefined;
    const savedComponents = buildComponents(titlebarArt, cardMeta);
    addCustomTheme({
      ...theme,
      bevel,
      colors: { ...colors },
      components: savedComponents,
      label: name.trim(),
      name: safeName,
      overlay: overlay === "none" ? undefined : overlay,
      overrides: savedOverrides,
      radius,
    });
    if (currentTheme === safeName) setTheme(safeName);
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

        <OverridesSection
          colors={colors}
          overrides={overrides}
          onPick={patchOverride}
          onReset={resetOverride}
        />

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
          <div className="flex items-center gap-2 px-1">
            <span className="windows95-text text-text w-24 shrink-0 truncate">
              {t("settings.theme.shape.overlay")}
            </span>
            <Combobox
              value={overlay}
              onChange={(value) => setOverlay(value as typeof overlay)}
              options={[
                { value: "none", label: t("settings.theme.shape.overlay.none") },
                { value: "scanlines", label: t("settings.theme.shape.overlay.scanlines") },
                { value: "grid", label: t("settings.theme.shape.overlay.grid") },
              ]}
              className="max-w-xs"
            />
          </div>
          <div className="flex items-center gap-2 px-1">
            <span className="windows95-text text-text w-24 shrink-0 truncate">
              {t("settings.theme.components.cardMeta")}
            </span>
            <Combobox
              value={cardMeta}
              onChange={(value) => setCardMeta(value as typeof cardMeta)}
              options={[
                { value: "full", label: t("settings.theme.components.cardMeta.full") },
                { value: "short", label: t("settings.theme.components.cardMeta.short") },
              ]}
              className="max-w-xs"
            />
          </div>
          <label className="windows95-text text-text flex cursor-pointer items-center gap-2 px-1 select-none">
            <Checkbox checked={titlebarArt} onChange={setTitlebarArt} />
            {t("settings.theme.components.titlebarArt")}
          </label>
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

        <ThemePreview
          name={name}
          radius={radius}
          colors={colors}
          gradient={theme?.titlebarGradient}
        />

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
