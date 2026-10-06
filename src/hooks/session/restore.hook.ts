import { useMemo } from "react";

import { useSessionStatus } from "@/hooks/session/queries.hook";
import { restoreDecision } from "@/lib/session/restore.utils";
import { useSessionStore } from "@/store/session.store";

// Stale role:null would fake reconnect after manual join.
export function useSessionRestore() {
  const identity = useSessionStore((state) => state.identity);
  const status = useSessionStatus();
  const role = status.data?.role ?? null;
  const decision = useMemo(() => restoreDecision(identity, role), [identity, role]);
  return { decision, settled: !status.isFetching };
}
