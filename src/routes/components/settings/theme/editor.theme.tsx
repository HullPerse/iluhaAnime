import { useEffect, useRef, useState } from "react";

import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import Combobox from "@/components/ui/combobox.component";
import { Input } from "@/components/ui/input.component";
import Slider from "@/components/ui/range.component";
import { useI18n } from "@/hooks/i18n.hook";
import { useCell } from "@/lib/core/signal.hook";
import { previewTheme } from "@/lib/core/appearance.utils";
import { buildThemeColors, readImagePalette } from "@/lib/graphics/palette.utils";
import {
  DEFAULT_COLORS,
  buildComponents,
  buildThemeName,
  editorHeaderKey,
  saveTheme,
} from "@/lib/graphics/themeEditor.utils";
import { themeAtoms } from "@/store/theme.store";
import type {
  ThemeColorKey,
  ThemeComponents,
  ThemeDefinition,
  ThemeOverrideKey,
} from "@/types/graphics/theme";

import { ColorGrid } from "@/routes/components/settings/theme/editor/colorGrid.editor";
import { OverridesSection } from "@/routes/components/settings/theme/editor/overridesSection.editor";
import { PaletteSection } from "@/routes/components/settings/theme/editor/paletteSection.editor";
import { ThemePreview } from "@/routes/components/settings/theme/editor/themePreview.editor";

export default function ThemeEditor({
  theme,
  baseTheme,
  patchMode = false,
  onClose,
}: {
  theme?: ThemeDefinition;
  baseTheme?: ThemeDefinition;
  patchMode?: boolean;
  onClose: () => void;
}) {
  const currentTheme = useCell(themeAtoms.currentTheme);
  const { t } = useI18n();
  const isEdit = !!theme && !patchMode;
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
    previewTheme({
      ...theme,
      bevel,
      colors,
      components: buildComponents(titlebarArt, cardMeta),
      overlay,
      overrides,
      radius,
    });
  }, [bevel, cardMeta, colors, currentTheme, overlay, overrides, radius, theme, titlebarArt]);

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
    const safeName = buildThemeName(name, theme, patchMode, baseTheme);
    const savedOverrides =
      overrides && Object.keys(overrides).length > 0 ? { ...overrides } : undefined;
    const savedComponents = buildComponents(titlebarArt, cardMeta);
    const draft: ThemeDefinition = {
      ...theme,
      bevel,
      colors: { ...colors },
      components: savedComponents,
      label: name.trim(),
      name: safeName,
      overlay,
      overrides: savedOverrides,
      radius,
    };
    saveTheme(draft, currentTheme, patchMode, baseTheme);
    onClose();
  };

  const header = t(editorHeaderKey(patchMode, isEdit));

  return (
    <Modal header={header} onClose={onClose}>
      <div className="flex flex-col gap-3 p-2">
        <label className="windows95-text text-text flex items-center gap-2">
          <span className="w-24 shrink-0">{t("settings.theme.name")}</span>
          <Input
            value={name}
            disabled={patchMode}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("settings.theme.name.placeholder")}
          />
        </label>
        {patchMode && <span className="text-hint text-xs">{t("settings.theme.patch.hint")}</span>}

        <PaletteSection
          fileRef={fileRef}
          palette={palette}
          paletteFailed={paletteFailed}
          onLoad={() => fileRef.current?.click()}
          onApply={() => setColors((prev) => ({ ...prev, ...buildThemeColors(palette) }))}
          onFile={handleFile}
          onPick={(color) => patchColor(selected, color)}
        />

        <ColorGrid colors={colors} selected={selected} onSelect={setSelected} onPick={patchColor} />

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
