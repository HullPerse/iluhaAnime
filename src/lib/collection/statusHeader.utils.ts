import { PUBLIC_STATUS_MAX_ITEMS } from "@/config/anilist/statuses.config";
import type { CollectionStatusDef } from "@/types/anilist/collection";

export const publicHeaderProps = ({
  status,
  count,
  addLabel,
  onAddToStatus,
}: {
  status: CollectionStatusDef;
  count: number;
  addLabel: string;
  onAddToStatus?: (status: CollectionStatusDef) => void;
}): { maxCount?: number; onAdd?: () => void; addDisabled?: boolean; addLabel?: string } => {
  if (status.kind !== "public") return {};
  return {
    maxCount: PUBLIC_STATUS_MAX_ITEMS,
    onAdd: onAddToStatus ? () => onAddToStatus(status) : undefined,
    addDisabled: count >= PUBLIC_STATUS_MAX_ITEMS,
    addLabel,
  };
};
