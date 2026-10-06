import { sessionApi } from "@/api/session.api";
import { LOBBY_STATUS_POLL_MS } from "@/config/lobby/common.config";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { queryKeys } from "@/lib/query/keys.utils";
import type { SessionStatus } from "@/types/session";

export const SESSION_STATUS_QUERY_KEY = queryKeys.sessionStatus();

export function useSessionStatus() {
  return useAppQuery<SessionStatus>("live", {
    queryFn: () => sessionApi.status(),
    queryKey: SESSION_STATUS_QUERY_KEY,
    refetchInterval: LOBBY_STATUS_POLL_MS,
  });
}
