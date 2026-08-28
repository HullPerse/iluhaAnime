import { createContext, useCallback, useContext } from "react";

import { CORE_DEFAULT_LABELS } from "@/config/collection.config";
import { statusColorOf as statusColorOfUtil } from "@/lib/collection.utils";
import { DEFAULT_COLLECTION_STATUSES } from "@/lib/collection.queries";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import type { CollectionStatusDef } from "@/types/collection";

export const StatusMetaContext = createContext<CollectionStatusDef[]>(DEFAULT_COLLECTION_STATUSES);

export const useStatuses = () => useContext(StatusMetaContext);

export function statusColorOf(statuses: CollectionStatusDef[], id: string): string {
  return statusColorOfUtil(statuses, id);
}

export function useStatusLabel(): (id: string) => string {
  const statuses = useStatuses();
  const { t } = useI18n();
  return useCallback(
    (id: string) => {
      const def = statuses.find((s) => s.id === id);
      if (!def) return id;
      if (def.isCore && CORE_DEFAULT_LABELS[def.id] === def.label) {
        return t(`collection.status.${def.id}` as TranslationKey);
      }
      return def.label;
    },
    [statuses, t]
  );
}
