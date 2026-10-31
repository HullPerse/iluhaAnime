import { cn } from "cn";
import { List, RefreshCw } from "lucide-react";

import { SmallLoader } from "@/components/shared/loader/small.loader";
import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { useI18n } from "@/hooks/i18n.hook";
import { formatMeanScore, parseScoreFormat } from "@/lib/anilist/anilistScore.utils";
import type { AniFriend, AniUserProfile } from "@/types/anilist/anilist";

import { FriendActivityFeed } from "@/routes/components/anilist/activity/friendActivity.activity";

export interface FriendPreviewProps {
  friend: AniFriend | undefined;
  profile: AniUserProfile | undefined;
  profileError: string | null;
  refreshing: boolean;
  hasSelection: boolean;
  onViewLists: (friend: AniFriend) => void;
  onRefresh: (force: boolean) => void;
}

export function FriendPreview({
  friend,
  profile,
  profileError,
  refreshing,
  hasSelection,
  onViewLists,
  onRefresh,
}: FriendPreviewProps) {
  const { t } = useI18n();
  const meanScore = formatMeanScore(profile?.mean_score, parseScoreFormat(profile?.score_format));
  let relationshipLabel = t("anilist.friends.not.following");
  if (profile?.is_following == null) relationshipLabel = t("anilist.friends.relationship.unavailable");
  else if (profile.is_following) relationshipLabel = t("anilist.friends.following");
  if (!hasSelection || profile === undefined) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6">
        {hasSelection && profileError && (
          <>
            <span className="windows95-text text-destructive text-xs">{profileError}</span>
            <Button
              size="icon"
              className="size-5"
              title={t("anilist.friends.refresh")}
              disabled={friend === undefined || refreshing}
              onClick={() => onRefresh(true)}
            >
              <RefreshCw className="size-3" />
            </Button>
          </>
        )}
        {hasSelection && !profileError && <SmallLoader size={5} />}
        {!hasSelection && (
          <span className="windows95-text text-hint text-center text-xs">
            {t("anilist.friends.help")}
          </span>
        )}
      </div>
    );
  }
  return (
    <div className="windows95-border bg-field min-h-0 flex-1 overflow-y-auto">
      {profile.banner_image && (
        <div className="bg-secondary h-20 overflow-hidden">
          <ImageComponent
            src={profile.banner_image}
            alt=""
            className="h-full w-full object-cover"
          />
        </div>
      )}
      <div className="flex items-start gap-2 p-2">
        <ImageComponent
          src={profile.avatar || "/images/user_avatar.ico"}
          alt={profile.name}
          className="windows95-active-border size-16 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <h3 className="windows95-text text-sm font-bold">{profile.name}</h3>
          <p className="windows95-text text-xs">
            {profile.anime_count} {t("anilist.friends.anime")} - {profile.episodes_watched}{" "}
            {t("anilist.friends.episodes")}
            {meanScore != null && ` - ${t("anilist.friends.score")}: ${meanScore}`}
          </p>
          <p className="windows95-text text-hint mt-1 text-xs">
            {relationshipLabel}
            {profile.is_follower === true ? ` - ${t("anilist.friends.follows.you")}` : ""}
          </p>
        </div>
        {friend && (
          <Button
            size="icon"
            className="size-5"
            title={t("anilist.friends.view.lists")}
            onClick={() => onViewLists(friend)}
          >
            <List className="size-3" />
          </Button>
        )}
        <Button
          size="icon"
          className="size-5"
          title={t("anilist.friends.refresh")}
          disabled={friend === undefined || refreshing}
          onClick={() => onRefresh(true)}
        >
          <RefreshCw className={cn("size-3", refreshing && "animate-spin")} />
        </Button>
      </div>
      {profile.about && (
        <p className="windows95-text border-t border-black/20 p-2 text-xs whitespace-pre-wrap">
          {profile.about}
        </p>
      )}
      <div className="border-t border-black/20 p-2">
        <FriendActivityFeed friendId={profile.id} />
      </div>
    </div>
  );
}
