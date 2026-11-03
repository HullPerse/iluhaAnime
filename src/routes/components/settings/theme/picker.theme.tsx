import { useI18n } from "@/hooks/i18n.hook";
import { themeMode } from "@/lib/graphics/themeResolve.utils";
import type { TranslationKey } from "@/types/core/i18n";
import type { ThemeDefinition, ThemeMode } from "@/types/graphics/theme";

import { ThemeRow } from "./picker/row.picker";

const THEME_MODES: readonly { id: ThemeMode; label: TranslationKey }[] = [
  { id: "dark", label: "settings.theme.mode.dark" },
  { id: "light", label: "settings.theme.mode.light" },
];

export function ThemePicker({
  builtins,
  customThemes,
  currentTheme,
  onSelect,
  onEdit,
  onDelete,
}: {
  builtins: readonly ThemeDefinition[];
  customThemes: readonly ThemeDefinition[];
  currentTheme: string;
  onSelect: (name: string) => void;
  onEdit: (theme: ThemeDefinition) => void;
  onDelete: (name: string) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-2">
      {THEME_MODES.map((mode) => {
        const themes = builtins.filter((theme) => themeMode(theme) === mode.id);
        if (themes.length === 0) return null;
        return (
          <section key={mode.id} className="flex flex-col gap-1">
            <h3 className="windows95-text text-hint text-xs font-bold">{t(mode.label)}</h3>
            <ThemeRow
              themes={themes}
              currentTheme={currentTheme}
              onSelect={onSelect}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          </section>
        );
      })}

      {customThemes.length > 0 && (
        <section className="flex flex-col gap-1">
          <h3 className="windows95-text text-hint text-xs font-bold">
            {t("settings.theme.family.custom")}
          </h3>
          <ThemeRow
            themes={customThemes}
            currentTheme={currentTheme}
            isCustom
            onSelect={onSelect}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </section>
      )}
    </div>
  );
}
