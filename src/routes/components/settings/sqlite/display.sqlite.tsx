import { Hash, Infinity as InfinityIcon } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/locale/i18n.utils";

export function DisplayToggle({
  display,
  onDisplayChange,
  deleting,
}: {
  display: "pagination" | "scroll";
  onDisplayChange: (value: "pagination" | "scroll") => void;
  deleting: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="flex gap-1" role="group" aria-label={t("settings.sqlite.display.mode")}>
      <Button
        size="icon"
        className="size-6"
        title={t("settings.sqlite.display.scroll")}
        aria-pressed={display === "scroll"}
        onClick={() => onDisplayChange("scroll")}
        disabled={deleting || display === "scroll"}
      >
        <InfinityIcon className="size-3" />
      </Button>
      <Button
        size="icon"
        className="size-6"
        title={t("settings.sqlite.display.pagination")}
        aria-pressed={display === "pagination"}
        onClick={() => onDisplayChange("pagination")}
        disabled={deleting || display === "pagination"}
      >
        <Hash className="size-3" />
      </Button>
    </div>
  );
}
