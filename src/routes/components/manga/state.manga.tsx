import type { ReactNode } from "react";

import { SmallLoader } from "@/components/shared/loader/small.loader";

export function MangaState({ children, kind }: { children: ReactNode; kind: "loading" | "error" }) {
  return (
    <div
      className="windows95-border bg-field flex flex-wrap items-center gap-2 p-2 text-xs"
      role={kind === "error" ? "alert" : "status"}
    >
      {kind === "loading" && <SmallLoader size={3} />}
      {children}
    </div>
  );
}
