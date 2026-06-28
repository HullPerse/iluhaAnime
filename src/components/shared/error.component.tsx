import { ReactNode } from "react";

export function BigError({ error, icon }: { error: Error; icon: ReactNode }) {
  return (
    <main className="absolute flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background px-2 font-extrabold text-text">
      {icon}
      <span className="text-center text-xl text-text">{error.message}</span>
    </main>
  );
}
