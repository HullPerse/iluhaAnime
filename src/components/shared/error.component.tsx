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

export function BigErrorWithButton({ error, icon, refresh }: { error: Error; icon: ReactNode; refresh?: () => void }) {
  return (
    <main className="absolute flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background px-2 font-extrabold text-text">
      {icon}
      <span className="text-center text-xl text-text">{error.message}</span>
      {refresh && (
        <button onClick={refresh} className="border-2 border-solid border-t-white border-l-white border-b-muted border-r-muted bg-primary px-2 py-0.5 text-[11px] cursor-pointer active:border-t-muted active:border-l-muted active:border-b-white active:border-r-white">
          Повторить
        </button>
      )}
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
