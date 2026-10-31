import type { AniFriend, AniUserProfile } from "@/types/anilist/anilist";

export interface FriendPreviewProps {
  friend: AniFriend | undefined;
  profile: AniUserProfile | undefined;
  profileError: string | null;
  refreshing: boolean;
  hasSelection: boolean;
  onViewLists: (friend: AniFriend) => void;
  onRefresh: (force: boolean) => void;
}
