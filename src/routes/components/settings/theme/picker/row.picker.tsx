import type { ThemeDefinition } from "@/types/graphics/theme";

import { ThemeCard } from "@/routes/components/settings/theme/card.theme";

export function ThemeRow({
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
