import { THEME_FAMILIES } from "@/config/themes.config";
import { useI18n } from "@/hooks/i18n.hook";
import type { ThemeDefinition } from "@/types/theme";

import { ThemeCard } from "./card.theme";

function ThemeRow({
  themes,
  currentTheme,
  isCustom,
  onSelect,
  onEdit,
  onDelete,
}: {
  themes: readonly ThemeDefinition[];
  currentTheme: string;
  isCustom?: boolean;
  onSelect: (name: string) => void;
  onEdit: (theme: ThemeDefinition) => void;
  onDelete: (name: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {themes.map((theme) => (
        <ThemeCard
          key={theme.name}
          theme={theme}
          isActive={currentTheme === theme.name}
          isCustom={isCustom}
          onSelect={() => onSelect(theme.name)}
          onEdit={isCustom ? () => onEdit(theme) : undefined}
          onDelete={isCustom ? () => onDelete(theme.name) : undefined}
        />
      ))}
    </div>
  );
}

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
      {THEME_FAMILIES.map((family) => {
        const themes = builtins.filter((theme) => theme.family === family.id);
        if (themes.length === 0) return null;
        return (
          <section key={family.id} className="flex flex-col gap-1">
            <h3 className="windows95-text text-hint text-xs font-bold">{t(family.label)}</h3>
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
