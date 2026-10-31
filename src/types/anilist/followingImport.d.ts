import type { AniFriendMinimal } from "@/types/anilist/anilist";

export interface FollowingImportProps {
  selfId: number | null;
  addedIds: Set<number>;
  onAddMany: (friends: AniFriendMinimal[]) => void;
  onClose: () => void;
}
