import { cn } from "cn";
import { Box } from "lucide-react";

import { useI18n } from "@/lib/locale/i18n.utils";

export function BigLoader() {
  return (
    <div className="bg-primary text-secondary absolute flex h-screen w-screen flex-col items-center justify-center font-extrabold">
      <Box className="size-28 animate-spin" />
    </div>
  );
}

export function TabLoader({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "bg-surface text-secondary flex h-full min-h-40 w-full flex-col items-center justify-center gap-2",
        className
      )}
      aria-busy="true"
    >
      <SmallLoader size={6} />
    </div>
  );
}

export function SmallLoader({ size = 4, className }: { size?: number; className?: string }) {
  const { t } = useI18n();
  return (
    <Box
      aria-label={t("common.loading")}
      className={cn("ui-loading-spinner text-secondary animate-spin", className)}
      style={{ height: `${size * 0.25}rem`, width: `${size * 0.25}rem` }}
    />
  );
}
