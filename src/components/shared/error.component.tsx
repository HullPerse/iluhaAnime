import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function BigError({ error, icon }: { error: Error; icon: ReactNode }) {
  return (
    <main className="absolute flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background px-2 font-extrabold text-text">
      {icon}
      <span className="text-center text-xl text-text">{error.message}</span>
    </main>
  );
}

export function WindowError({
  error,
  icon,
  className,
}: {
  error: Error;
  icon: ReactNode;
  className?: string;
  button?: boolean;
  refresh?: () => void;
}) {
  return (
    <main
      className={cn(
        "flex h-full w-full flex-col items-center justify-center gap-4 bg-card px-2 font-extrabold text-text",
        className,
      )}
    >
      {icon}
      <span className="text-center text-xl text-text">{error.message}</span>
    </main>
  );
}
