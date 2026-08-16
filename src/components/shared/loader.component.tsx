import { Box } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/index.utils";

export function BigLoader() {
  return (
    <main className="bg-primary text-secondary absolute flex h-screen w-screen flex-col items-center justify-center font-extrabold">
      <Box className="size-28 animate-spin" />
    </main>
  );
}

export function WindowLoader({ className }: { className?: string }) {
  return (
    <main
      className={cn(
        "bg-surface text-secondary flex h-full w-full flex-col items-center justify-center font-extrabold",
        className
      )}
    >
      <Box className="size-28 animate-spin" />
    </main>
  );
}

export function SmallLoader({
  size = 4,
  className,
}: {
  size?: number;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <Box
      aria-label={t("common.loading")}
      className={cn(
        "ui-loading-spinner text-secondary animate-spin",
        className
      )}
      style={{ height: `${size * 0.25}rem`, width: `${size * 0.25}rem` }}
    />
  );
}
