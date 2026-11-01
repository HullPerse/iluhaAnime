import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { resetSetting } from "@/lib/core/reset.utils";
import type { ResettableSetting } from "@/lib/core/reset.utils";

export function SettingResetButton({
  field,
  label,
}: {
  field: ResettableSetting | readonly ResettableSetting[];
  label: string;
}) {
  const { t } = useI18n();

  return (
    <Button
      title={t("settings.reset.section")}
      aria-label={`${t("settings.reset.section")}: ${label}`}
      onClick={() => resetSetting(field)}
      className="size-5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
    >
      <RefreshCw className="size-3" />
    </Button>
  );
}
