import { useEffect, useState } from "react";

import type { TabId } from "@/types/settings";

export const OFFLINE_DISABLED_TABS: readonly TabId[] = ["anilist", "search"];

export function isOfflineDisabledTab(id: TabId): boolean {
  return (OFFLINE_DISABLED_TABS as readonly TabId[]).includes(id);
}

export function markOfflineTabs<T extends { id: TabId }>(
  tabs: readonly T[],
  isOnline: boolean
): (T & { disabled: boolean })[] {
  return tabs.map((tab) => ({
    ...tab,
    disabled: !isOnline && isOfflineDisabledTab(tab.id),
  }));
}

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine
  );

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return online;
}
