import { useQueryClient } from "@tanstack/react-query";

import { sessionApi } from "@/api/session.api";
import {
  SESSION_HANDOVER_EVENT,
  SESSION_MIGRATE_EVENT,
} from "@/config/lobby/common.config";
import { useI18n } from "@/hooks/i18n.hook";
import { useTauriEvent } from "@/hooks/tauriEvent.hook";
import { toError } from "@/lib/utils/attempt.utils";
import { ignore } from "@/lib/utils/promise.utils";
import { showError } from "@/lib/utils/notification.utils";
import { useSessionStore } from "@/store/session.store";
import type { SessionRole } from "@/types/session";

import { SESSION_STATUS_QUERY_KEY } from "./queries.hook";

/**
 * Host migration bridge (lobby.md §14).
 *
 * The outgoing host picks a successor on the backend wire; this instance is
 * told to take the room over with its own local item → path map (host paths
 * are never broadcast, so the successor owns them from the frontend store).
 * The `session-migrate` event only means the room moved: the poll refreshes
 * the roster/roles, and the backend redials the new host on its own.
 */
export function useSessionHandoverBridge(role: SessionRole | null): void {
  const queryClient = useQueryClient();
  const { t } = useI18n();

  useTauriEvent(
    SESSION_HANDOVER_EVENT,
    () => {
      ignore(
        (async () => {
          await sessionApi.acceptHandover(useSessionStore.getState().planPaths);
        })().then(() =>
          queryClient.invalidateQueries({ queryKey: SESSION_STATUS_QUERY_KEY })
        ).catch((error: unknown) => {
          showError(t("lobby.error.title"), toError(error).message);
        })
      );
    },
    { enabled: role === "guest", errorTag: "session-handover" }
  );

  useTauriEvent(
    SESSION_MIGRATE_EVENT,
    () => {
      ignore(
        queryClient.invalidateQueries({ queryKey: SESSION_STATUS_QUERY_KEY })
      );
    },
    { enabled: role === "guest", errorTag: "session-migrate" }
  );
}
