import { cn } from "cn";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { ThemeDefinition } from "@/types/theme";

export function ThemeCard({
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
        className={cn(
          "windows95-active-border bg-primary focus-visible:outline-text flex cursor-pointer flex-col items-center gap-1 p-2 focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-dotted",
          isActive && "ring-text ring-2 ring-inset"
        )}
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
