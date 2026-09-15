import { cn } from "cn";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import { getTitleText } from "@/store/theme.store";
import type { ThemeDefinition } from "@/types/theme";

export function ThemeCard({
  theme,
  isActive,
  isCustom,
  onSelect,
  onDelete,
  onEdit,
}: {
  theme: ThemeDefinition;
  isActive: boolean;
  isCustom?: boolean;
  onSelect: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
}) {
  const c = theme.colors;
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        className={cn(
          "windows95-active-border bg-primary focus-visible:outline-text flex cursor-pointer flex-col items-center gap-1 p-2 focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-dotted",
          isActive && "ring-text ring-2 ring-inset"
        )}
        onClick={onSelect}
        title={theme.label}
        aria-pressed={isActive}
      >
        <div
          className="windows95-border flex w-28 flex-col"
          style={{
            background: c.primary,
            borderColor: `${c.muted} ${c.winHighlight} ${c.winHighlight} ${c.muted}`,
          }}
          aria-hidden="true"
        >
          <div
            className="windows95-text truncate px-1 text-[9px] font-bold"
            style={{ background: c.secondary, color: getTitleText(c.secondary) }}
          >
            {theme.label}
          </div>
          <div className="flex flex-col gap-1 p-1">
            <div className="flex gap-0.5">
              <span
                className="size-3"
                style={{ background: c.surface }}
                title={t("settings.theme.color.surface")}
              />
              <span
                className="size-3"
                style={{ background: c.highlight }}
                title={t("settings.theme.color.highlight")}
              />
              <span
                className="size-3"
                style={{ background: c.success }}
                title={t("settings.theme.color.success")}
              />
              <span
                className="size-3"
                style={{ background: c.destructive }}
                title={t("settings.theme.color.destructive")}
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="h-1 w-16" style={{ background: c.text }} />
              <span className="h-1 w-12" style={{ background: c.muted }} />
              <span
                className="h-1 w-20"
                style={{
                  background: c.autocomplete ?? c.muted,
                  opacity: c.autocompleteOpacity ?? 0.6,
                }}
              />
            </div>
          </div>
        </div>
        <span className="windows95-text text-text text-xs">
          {theme.label}
          {isCustom && t("settings.theme.custom")}
        </span>
      </button>
      {isCustom && (onEdit || onDelete) && (
        <div className="flex gap-1">
          {onEdit && (
            <Button className="text-xs underline" size="default" onClick={onEdit}>
              {t("settings.theme.edit")}
            </Button>
          )}
          {onDelete && (
            <Button
              className="text-xs underline"
              variant="destructive"
              size="default"
              onClick={onDelete}
            >
              {t("settings.theme.delete")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
