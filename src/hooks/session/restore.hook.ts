import { useMemo } from "react";

import { useSessionStatus } from "@/hooks/session/queries.hook";
import { restoreDecision } from "@/lib/session/restore.utils";
import { useSessionStore } from "@/store/session.store";

/**
 * The restore decision for the persisted identity against the live session
 * status. A reconnect is offered only when no session is active and the saved
 * identity belonged to a guest.
 */
export function useSessionRestore() {
  const identity = useSessionStore((state) => state.identity);
  const status = useSessionStatus();
  const role = status.data?.role ?? null;
  return useMemo(() => restoreDecision(identity, role), [identity, role]);
}
