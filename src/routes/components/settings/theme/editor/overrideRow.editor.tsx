import { Button } from "@/components/ui/button.component";
import { ColorPickerTrigger } from "@/components/ui/color/trigger.color";
import { useI18n } from "@/hooks/i18n.hook";
import type { TranslationKey } from "@/types/core/i18n";

export function OverrideRow({
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
