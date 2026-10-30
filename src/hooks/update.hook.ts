import { useCallback } from "react";

import { useAppQuery } from "@/hooks/appQuery.hook";
import { useOnlineStatus } from "@/hooks/network.hook";
import { queryKeys } from "@/lib/keys.utils";
import { checkForUpdates } from "@/lib/update.utils";
import { openUpdatePrompt } from "@/store/update.store";
import type { UpdateCheckOutcome } from "@/types/update";

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
