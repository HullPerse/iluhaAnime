import { StepBack } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { AniFriend, AniUserProfile } from "@/types/anilist";

export default function AniListFriendHeader({
  friend,
  profile,
  loadingList,
  onBack,
}: {
  friend: AniFriend;
  profile: AniUserProfile | null;
  loadingList: boolean;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const name = profile?.name ?? friend.name;
  const avatar = profile?.avatar ?? friend.avatar;

  return (
    <div className="windows95-active-border bg-primary flex w-full flex-col p-1">
      <section className="flex flex-row items-center gap-2">
        <div className="relative h-10 w-10 bg-field">
          <ImageComponent
            src={avatar || "/images/user_avatar.ico"}
            alt={name}
            className="windows95-active-border h-10 w-10"
          />

          <Button
            className="absolute top-0 right-0 h-10 w-10 opacity-0 hover:opacity-70"
            size="icon"
            variant="error"
            onClick={onBack}
            title={t("anilist.friends.back")}
          >
            <StepBack />
          </Button>
        </div>
        <div className="flex flex-col">
          <span className="windows95-text font-bold">{name.toUpperCase()}</span>
          <span className="windows95-text text-xs">
            {loadingList ? (
              "..."
            ) : (
              <>
                {t("anilist.header.anime.count", {
                  count: profile?.anime_count ?? 0,
                  episodes: profile?.episodes_watched ?? 0,
                })}
                {profile?.mean_score != null && (
                  <> - {t("anilist.header.mean.score", { score: profile.mean_score })}</>
                )}
              </>
            )}
          </span>
        </div>
      </section>
    </div>
  );
}
