import { useEffect, useState } from "react";

import type { TabId } from "@/types/ui/settings";

const OFFLINE_DISABLED_TABS: ReadonlySet<TabId> = new Set([
  "anilist",
  "search",
  "stream",
  "news",
]);

export function isOfflineDisabledTab(id: TabId): boolean {
  return OFFLINE_DISABLED_TABS.has(id);
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
  const [online, setOnline] = useState<boolean>(() =>
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
