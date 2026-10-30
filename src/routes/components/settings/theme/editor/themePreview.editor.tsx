import { cn } from "cn";
import { useI18n } from "@/hooks/i18n.hook";
import { getTitleText } from "@/lib/graphics/palette.utils";
import type { ThemeDefinition } from "@/types/graphics/theme";

export function ThemePreview({
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
        "windows95-border flex w-85 flex-col self-center",
        radius === "all" && "rounded-[5px]"
      )}
    >
      <div
        className={cn("windows95-text px-1 text-xs font-bold", radius !== "none" && "rounded-t-md")}
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
