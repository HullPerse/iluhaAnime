import { defaultWindowIcon } from "@tauri-apps/api/app";
import { Menu } from "@tauri-apps/api/menu";
import { TrayIcon } from "@tauri-apps/api/tray";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useMemo, useRef } from "react";

import { useI18n } from "@/lib/locale/i18n.utils";
import { buildTrayMenuEntries, shouldHideOnClose, TRAY_ICON_ID } from "@/lib/settings/tray.utils";
import { attempt, attemptAll, attemptSync, reportBackgroundError } from "@/lib/utils/attempt.utils";
import { useSettingsStore } from "@/store/settings.store";
import type { TabId } from "@/types/settings";

export interface TrayTab {
  id: TabId;
  label: string;
}

async function showMainWindow(): Promise<void> {
  const window = getCurrentWindow();
  const error = await attemptAll([
    () => window.show(),
    () => window.unminimize(),
    () => window.setFocus(),
  ]);
  if (error) reportBackgroundError("tray.show", error);
}

export function useTray(tabs: readonly TrayTab[], onSelectTab: (tab: TabId) => void): void {
  const { t } = useI18n();
  const minimizeToTray = useSettingsStore((s) => s.minimizeToTray);
  const selectRef = useRef(onSelectTab);
  const allowQuitRef = useRef(false);
  const entries = useMemo(() => buildTrayMenuEntries(tabs, t("settings.tray.quit")), [tabs, t]);

  useEffect(() => {
    selectRef.current = onSelectTab;
  });

  useEffect(() => {
    let disposed = false;
    const quitApp = async () => {
      allowQuitRef.current = true;
      const [, error] = await attempt(getCurrentWindow().close());
      if (error) {
        allowQuitRef.current = false;
        reportBackgroundError("tray.quit", error);
      }
    };
    (async () => {
      const [menu, menuError] = await attempt(
        Menu.new({
          items: entries.map((entry) => {
            if (entry.kind === "separator") return { item: "Separator" as const };
            if (entry.kind === "quit")
              return {
                id: entry.id,
                text: entry.text,
                action: () => {
                  quitApp();
                },
              };
            return {
              id: entry.id,
              text: entry.text,
              action: () => {
                selectRef.current(entry.tabId);
                showMainWindow();
              },
            };
          }),
        })
      );
      if (menuError || !menu || disposed) {
        if (menuError) reportBackgroundError("tray.menu", menuError);
        return;
      }
      const [existing] = await attempt(TrayIcon.getById(TRAY_ICON_ID));
      if (disposed) return;
      if (existing) {
        const [, setMenuError] = await attempt(existing.setMenu(menu));
        if (setMenuError) reportBackgroundError("tray.menu", setMenuError);
        return;
      }
      const [icon] = await attempt(defaultWindowIcon());
      if (disposed) return;
      const [, createError] = await attempt(
        TrayIcon.new({
          id: TRAY_ICON_ID,
          icon: icon ?? undefined,
          tooltip: "iluhaAnime",
          menu,
          showMenuOnLeftClick: false,
          action: (event) => {
            if (event.type !== "Click" && event.type !== "DoubleClick") return;
            if (event.button !== "Left") return;
            showMainWindow();
          },
        })
      );
      if (createError) reportBackgroundError("tray.create", createError);
    })();
    return () => {
      disposed = true;
    };
  }, [entries]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const hideWindow = async () => {
      const [, error] = await attempt(getCurrentWindow().hide());
      if (error) reportBackgroundError("tray.hide", error);
    };
    const [listening, syncError] = attemptSync(() =>
      getCurrentWindow().onCloseRequested((event) => {
        if (!shouldHideOnClose(minimizeToTray, allowQuitRef.current)) return;
        event.preventDefault();
        hideWindow();
      })
    );
    if (syncError) {
      reportBackgroundError("tray.close-requested", syncError);
      return undefined;
    }
    listening
      .then((cleanup) => {
        if (disposed) cleanup();
        else unlisten = cleanup;
      })
      .catch((error) => reportBackgroundError("tray.close-requested", error));
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [minimizeToTray]);
}
