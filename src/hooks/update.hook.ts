import type { Update } from "@tauri-apps/plugin-updater";
import { useCallback } from "react";

import { useAppQuery } from "@/hooks/appQuery.hook";
import { useOnlineStatus } from "@/hooks/network.hook";
import { queryKeys } from "@/lib/query/keys.utils";
import { checkForUpdates } from "@/lib/utils/update.utils";
import { openUpdatePrompt } from "@/store/update.store";

export type UpdateCheckOutcome =
  | { status: "available"; update: Update }
  | { status: "none" }
  | { status: "error"; error: Error }
  | { status: "offline" };

export function useUpdateCheck() {
  const isOnline = useOnlineStatus();
  const { data, isFetching, refetch } = useAppQuery("static", {
    queryKey: queryKeys.appUpdates(),
    queryFn: checkForUpdates,
    enabled: isOnline,
    retry: false,
  });

  const check = useCallback(async (): Promise<UpdateCheckOutcome> => {
    if (!isOnline) return { status: "offline" };
    if (data) {
      openUpdatePrompt();
      return { status: "available", update: data };
    }
    const result = await refetch();
    if (result.error !== null) return { status: "error", error: result.error };
    if (result.data) {
      openUpdatePrompt();
      return { status: "available", update: result.data };
    }
    return { status: "none" };
  }, [data, isOnline, refetch]);

  return { data, isFetching, check };
}
