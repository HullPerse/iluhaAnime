import { cn } from "@/lib/utils";
import { Box } from "lucide-react";

export function BigLoader() {
  return (
    <main className="absolute flex h-screen w-screen flex-col items-center justify-center bg-background font-extrabold text-white">
      <Box className="size-28 animate-spin" />
    </main>
  );
}

export function WindowLoader({ className }: { className?: string }) {
  return (
    <main
      className={cn(
        "flex h-full w-full flex-col items-center justify-center bg-card font-extrabold text-text",
        className,
      )}
    >
      <Box className="size-28 animate-spin" />
    </main>
  );
}

export function SmallLoader({
  size,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Box
      className={cn(`text-text size- animate-spin ${size || 4}`, className)}
    />
  );
}
