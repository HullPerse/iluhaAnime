import type { ReactNode } from "react";

import { useCell } from "@hullperse/hp_utils/react";

import TitleBar from "@/components/shared/titlebar.component";
import { settingsAtoms } from "@/store/settings.store";

/** Keeps the custom window title bar above a fatal screen, which replaces the
    whole app shell. With native decorations enabled the OS title is already
    visible, so the in-app bar is only rendered for the custom chrome mode. */
export function FatalShell({ children }: { children: ReactNode }) {
  const customTitleBarEnabled = useCell(settingsAtoms.customTitleBarEnabled);

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      {customTitleBarEnabled ? (
        <div className="ui-panel flex h-full flex-col">
          <TitleBar title="iluhaAnime" />
          <div className="relative min-h-0 flex-1 overflow-hidden">{children}</div>
        </div>
      ) : (
        <div className="relative h-full w-full">{children}</div>
      )}
    </main>
  );
}
