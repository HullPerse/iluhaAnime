import type { AniUser } from "@/types/anilist";
import { Button } from "@/components/ui/button.component";
import { Calendar, Flame, UserStar, LogOut } from "lucide-react";

interface Props {
  user: AniUser;
  loadingList: boolean;
  onStatsOpen: () => void;
  onBrowseOpen: () => void;
  onRecsOpen: () => void;
  onLogout: () => void;
}

export default function AniListProfileHeader({
  user,
  loadingList,
  onStatsOpen,
  onBrowseOpen,
  onRecsOpen,
  onLogout,
}: Props) {
  return (
    <section className="flex flex-col windows95-active-border bg-primary p-1 w-full">
      <div className="flex flex-row items-center gap-2">
        {user.avatar && (
          <img src={user.avatar} alt="" className="h-10 windows95-active-border" />
        )}
        <div className="flex flex-col">
          <span className="windows95-text font-bold">{user.name.toUpperCase()}</span>
          <span className="windows95-text text-[10px]">
            {loadingList ? "..." : (
              <>
                {user.anime_count} аниме · {user.episodes_watched} эп.
                {user.mean_score != null && <> · ср. {user.mean_score}</>}
              </>
            )}
          </span>
        </div>
        <Button size="icon" className="h-7 w-7 text-[10px] ml-auto" onClick={onStatsOpen} title="Календарь">
          <Calendar className="size-3" />
        </Button>
        <Button size="icon" className="h-7 w-7 text-[10px]" onClick={onBrowseOpen}>
          <Flame className="size-3" />
        </Button>
        <Button size="default" className="h-7 text-[10px]" onClick={onRecsOpen}>
          <UserStar className="size-3" />
        </Button>
        <Button size="icon" variant="error" onClick={onLogout}>
          <LogOut />
        </Button>
      </div>
    </section>
  );
}
