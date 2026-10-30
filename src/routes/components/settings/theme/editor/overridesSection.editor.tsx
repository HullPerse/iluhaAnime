import { useI18n } from "@/hooks/i18n.hook";
import { OVERRIDE_ROWS } from "@/lib/graphics/themeEditor.utils";
import type { ThemeDefinition } from "@/types/graphics/theme";
import type { ThemeOverrideKey } from "@/types/graphics/theme";

import { OverrideRow } from "@/routes/components/settings/theme/editor/overrideRow.editor";

export function OverridesSection({
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
