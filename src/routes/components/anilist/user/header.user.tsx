import { Calendar, Flame, UserStar, LogOut, GitBranch, Users } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { AniHeaderProps as Props } from "@/types/anilist";

export default function AniListProfileHeader({
  user,
  loadingList,
  onStatsOpen,
  onBrowseOpen,
  onRecsOpen,
  onPrefetchOpen,
  onFriendsOpen,
  onLogout,
}: Props) {
  const { t } = useI18n();

  return (
    <div className="windows95-active-border bg-primary flex w-full flex-col p-1">
      <section className="flex flex-row items-center gap-2">
        <div className="relative h-10 w-10 bg-white">
          <ImageComponent
            src={user.avatar ? user.avatar : "/images/user_avatar.ico"}
            alt="user avatar"
            className="windows95-active-border h-10 w-10"
          />

          <Button
            className="absolute top-0 right-0 h-10 w-10 opacity-0 hover:opacity-70"
            size="icon"
            variant="error"
            onClick={onLogout}
            title={t("anilist.header.logout")}
          >
            <LogOut />
          </Button>
        </div>
        <div className="flex flex-col">
          <span className="windows95-text font-bold">{user.name.toUpperCase()}</span>
          <span className="windows95-text text-xs">
            {loadingList ? (
              "..."
            ) : (
              <>
                {t("anilist.header.anime.count", {
                  count: user.anime_count,
                  episodes: user.episodes_watched,
                })}
                {user.mean_score != null && (
                  <> - {t("anilist.header.mean.score", { score: user.mean_score })}</>
                )}
              </>
            )}
          </span>
        </div>
        <Button
          size="icon"
          className="ml-auto h-7 w-7 text-xs"
          onClick={onStatsOpen}
          title={t("anilist.header.calendar")}
        >
          <Calendar className="size-3" />
        </Button>
        <Button size="icon" className="h-7 w-7 text-xs" onClick={onBrowseOpen}>
          <Flame className="size-3" />
        </Button>
        <Button
          size="icon"
          className="h-7 w-7 text-xs"
          onClick={onPrefetchOpen}
          title={t("anilist.header.prefetch")}
        >
          <GitBranch className="size-3" />
        </Button>
        <Button
          size="icon"
          className="h-7 w-7 text-xs"
          onClick={onFriendsOpen}
          title={t("anilist.friends.title")}
        >
          <Users className="size-3" />
        </Button>
        <Button size="default" className="h-7 text-xs" onClick={onRecsOpen}>
          <UserStar className="size-3" />
        </Button>
      </section>
    </div>
  );
}
