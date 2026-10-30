import { cn } from "cn";
import { Box } from "lucide-react";

import { useI18n } from "@/hooks/i18n.hook";

export function SmallLoader({
  size = 4,
  className,
  inheritSize = false,
}: {
  size?: number;
  className?: string;
  inheritSize?: boolean;
}) {
  const { t } = useI18n();
  return (
    <Box
      aria-label={t("common.loading")}
      className={cn("ui-loading-spinner text-secondary animate-spin", className)}
      style={inheritSize ? undefined : { height: `${size * 0.25}rem`, width: `${size * 0.25}rem` }}
    />
  );
}
