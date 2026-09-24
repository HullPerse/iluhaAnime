import { cn } from "cn";
import { List, RefreshCw, Trash2, UserPlus, Users, X } from "lucide-react";
import { useEffect, useState } from "react";

import { anilistApi } from "@/api/anilist.api";
import { SmallLoader } from "@/components/shared/loader.component";
import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { Input } from "@/components/ui/input.component";
import { hasFreshCachedProfile } from "@/lib/anilist/friends.utils";
import { formatMeanScore, parseScoreFormat } from "@/lib/anilist/score.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import { attempt } from "@/lib/utils/attempt.utils";
import { enterSubmit } from "@/lib/utils/keyboard.utils";
import { useAniListFriendsStore } from "@/store/anilist.store";
import type { AniFriend, AniUserProfile } from "@/types/anilist";
import type { AniFriendsProps as Props } from "@/types/anilist";

import { FriendActivityFeed } from "./activity/friendActivity.activity";

interface FriendPreviewProps {
  friend: AniFriend | undefined;
  profile: AniUserProfile | undefined;
  profileError: string | null;
  refreshing: boolean;
  hasSelection: boolean;
  onViewLists: (friend: AniFriend) => void;
  onRefresh: (force: boolean) => void;
}

function FriendPreview({
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
  if (!hasSelection || profile === undefined) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6">
        {hasSelection && profileError ? (
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
        ) : hasSelection ? (
          <SmallLoader size={5} />
        ) : (
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
            {profile.is_following == null
              ? t("anilist.friends.relationship.unavailable")
              : profile.is_following
                ? t("anilist.friends.following")
                : t("anilist.friends.not.following")}
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

export default function AniListFriendsModal({
  friends,
  onAdd,
  onRemove,
  onViewLists,
  onClose,
}: Props) {
  const { t } = useI18n();
  const cacheProfile = useAniListFriendsStore((state) => state.cacheProfile);
  const [query, setQuery] = useState("");
  const [profiles, setProfiles] = useState<Record<number, AniUserProfile>>({});
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    setProfiles((current) => {
      const next = { ...current };
      for (const friend of friends) {
        if (friend.profile && hasFreshCachedProfile(friend)) next[friend.id] = friend.profile;
      }
      return next;
    });
  }, [friends]);

  const fetchProfile = async (friend: AniFriend, force = false): Promise<void> => {
    setRefreshing(true);
    setProfileError(null);
    const [profile, fetchError] = await attempt(anilistApi.getProfile(friend.id));
    setRefreshing(false);
    if (fetchError) {
      if (force || !friend.profile) setProfileError(fetchError.message);
      return;
    }
    setProfiles((current) => ({ ...current, [profile.id]: profile }));
    cacheProfile(profile);
  };

  const selectFriend = (friend: AniFriend) => {
    setSelectedId(friend.id);
    setProfileError(null);
    if (!profiles[friend.id] && friend.profile) {
      const cached = friend.profile;
      setProfiles((current) => ({ ...current, [friend.id]: cached }));
    }
    if (!hasFreshCachedProfile(friend)) fetchProfile(friend).catch(() => {});
  };

  const loadProfile = async (value: string, force = false) => {
    const input = value.trim();
    if (!input) return;
    const id = /^\d+$/.test(input) ? Number(input) : undefined;
    const cachedFriend = friends.find((friend) =>
      id === undefined
        ? friend.name.toLocaleLowerCase() === input.toLocaleLowerCase()
        : friend.id === id
    );
    if (!force && cachedFriend) {
      selectFriend(cachedFriend);
      setQuery("");
      return;
    }

    setLoading(true);
    setError(null);
    const [profile, fetchError] = await attempt(
      anilistApi.getProfile(id, id === undefined ? input : undefined)
    );
    if (fetchError) setError(fetchError.message);
    else {
      setProfiles((current) => ({ ...current, [profile.id]: profile }));
      setSelectedId(profile.id);
      onAdd(profile);
      setQuery("");
    }
    setLoading(false);
  };

  const selectedProfile = selectedId != null ? profiles[selectedId] : undefined;
  const selectedFriend =
    selectedId != null ? friends.find((friend) => friend.id === selectedId) : undefined;

  return (
    <Modal header={t("anilist.friends.title")} onClose={onClose} className="w-4xl max-w-[92vw]">
      <div className="grid min-h-80 grid-cols-1 gap-2 md:grid-cols-[minmax(13rem,0.8fr)_minmax(0,1.4fr)]">
        <section className="windows95-border bg-field p-1">
          <div className="bg-secondary text-title-text mb-1 flex items-center gap-1 px-1 py-0.5">
            <Users className="size-3" />
            <span className="windows95-font text-xs">{t("anilist.friends.list")}</span>
          </div>
          <div className="flex flex-col gap-1">
            {friends.length === 0 ? (
              <span className="windows95-text text-hint p-2 text-center text-xs">
                {t("anilist.friends.empty")}
              </span>
            ) : (
              friends.map((friend) => (
                <div
                  key={friend.id}
                  className={cn(
                    "hover:bg-surface flex items-center gap-1 p-1",
                    selectedId === friend.id && "bg-surface"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => selectFriend(friend)}
                    title={friend.name}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-left"
                  >
                    <ImageComponent
                      src={friend.avatar || "/images/user_avatar.ico"}
                      alt={friend.name}
                      className="windows95-active-border size-7 shrink-0"
                    />
                    <span
                      className={cn(
                        "windows95-text truncate text-xs",
                        selectedId === friend.id && "font-bold"
                      )}
                    >
                      {friend.name}
                    </span>
                  </button>
                  <Button
                    size="icon"
                    className="size-5"
                    title={t("anilist.friends.view.lists")}
                    onClick={() => onViewLists(friend)}
                  >
                    <List className="size-3" />
                  </Button>
                  <Button
                    size="icon"
                    className="size-5"
                    title={t("anilist.friends.remove")}
                    onClick={() => onRemove(friend.id)}
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="windows95-border bg-primary flex min-w-0 flex-col gap-2 p-2">
          <div className="flex gap-1">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={enterSubmit(() => loadProfile(query))}
              placeholder={t("anilist.friends.placeholder")}
              className="min-w-0 flex-1"
            />
            <Button onClick={() => loadProfile(query)} disabled={loading || !query.trim()}>
              {loading ? <SmallLoader /> : <UserPlus className="size-3" />}
            </Button>
          </div>
          {error && (
            <div className="windows95-border text-destructive bg-field flex items-start gap-1 p-1 text-xs">
              <X className="mt-0.5 size-3 shrink-0" />
              <span className="windows95-text">{error}</span>
            </div>
          )}
          <FriendPreview
            friend={selectedFriend}
            profile={selectedProfile}
            profileError={profileError}
            refreshing={refreshing}
            hasSelection={selectedId !== null}
            onViewLists={onViewLists}
            onRefresh={(force) => {
              if (selectedFriend) fetchProfile(selectedFriend, force).catch(() => {});
            }}
          />
        </section>
      </div>
    </Modal>
  );
}
