import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { resetSection, sectionHasCustomReset } from "@/lib/settings/section-reset.utils";
import type { ResetSectionId } from "@/lib/settings/section-reset.utils";

interface SectionResetButtonProps {
  sectionId: ResetSectionId;
}

export function SectionResetButton({ sectionId }: SectionResetButtonProps) {
  const { t } = useI18n();

  if (sectionHasCustomReset(sectionId)) return null;

  return (
    <Button
      size="icon"
      variant="ghost"
      title={t("settings.reset.section")}
      aria-label={t("settings.reset.section")}
      onClick={() => resetSection(sectionId)}
    >
      <RefreshCw className="size-3" />
    </Button>
  );
}
