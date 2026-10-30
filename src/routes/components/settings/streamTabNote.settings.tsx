import { useI18n } from "@/hooks/i18n.hook";
import { useCell } from "@/lib/core/signal.hook";
import { settingsAtoms } from "@/store/settings.store";

export function StreamTabNote() {
  const { t } = useI18n();
  const language = useCell(settingsAtoms.language);
  if (language !== "en") return null;
  return <span className="text-hint text-xs">{t("settings.stream.tab.russianOnly")}</span>;
}
