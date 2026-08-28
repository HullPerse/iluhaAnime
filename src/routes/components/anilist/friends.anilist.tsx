import { invoke } from "@tauri-apps/api/core";
import { UserPlus, Trash2, RefreshCw, Users, X } from "lucide-react";
import { useEffect, useState } from "react";

import { SmallLoader } from "@/components/shared/loader.component";
import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { Input } from "@/components/ui/input.component";
import { PROFILE_CACHE_TTL_MS } from "@/config/friends.config";
import { useI18n } from "@/lib/i18n";
import { enterSubmit } from "@/lib/keyboard.utils";
import type { AniFriend, AniUserProfile } from "@/types/anilist";

function hasFreshCachedProfile(friend: AniFriend | undefined): boolean {
  return (
    !!friend?.profile &&
    typeof friend.profile_fetched_at === "number" &&
    Date.now() - (friend.profile_fetched_at as number) < PROFILE_CACHE_TTL_MS
  );
}

interface Props {
  friends: AniFriend[];
  onAdd: (profile: AniUserProfile) => void;
  onRemove: (id: number) => void;
  onClose: () => void;
}

export default function AniListFriendsModal({
  friends,
  onAdd,
  onRemove,
  onClose,
}: Props) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [profiles, setProfiles] = useState<Record<number, AniUserProfile>>({});
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setProfiles((current) => {
      const next = { ...current };
      for (const friend of friends) {
        if (friend.profile) next[friend.id] = friend.profile;
      }
      return next;
    });
  }, [friends]);

  const loadProfile = async (value: string, force = false) => {
    const input = value.trim();
    if (!input) return;
    const id = /^\d+$/.test(input) ? Number(input) : undefined;
    const cachedFriend = friends.find((friend) =>
      id === undefined
        ? friend.name.toLocaleLowerCase() === input.toLocaleLowerCase()
        : friend.id === id
    );
    if (!force && cachedFriend && hasFreshCachedProfile(cachedFriend)) {
      const profile = cachedFriend.profile!;
      setProfiles((current) => ({ ...current, [profile.id]: profile }));
      setSelectedId(profile.id);
      setQuery("");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const profile = await invoke<AniUserProfile>("get_anilist_profile", {
        userId: id,
        userName: id === undefined ? input : undefined,
      });
      setProfiles((current) => ({ ...current, [profile.id]: profile }));
      setSelectedId(profile.id);
      onAdd(profile);
      setQuery("");
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  const selected = selectedId == null ? null : profiles[selectedId];

  return (
    <Modal
      header={t("anilist.friends.title")}
      onClose={onClose}
      className="w-4xl max-w-[92vw]"
    >
      <div className="grid min-h-80 grid-cols-1 gap-2 md:grid-cols-[minmax(13rem,0.8fr)_minmax(0,1.4fr)]">
        <section className="windows95-border bg-white p-1">
          <div className="bg-secondary mb-1 flex items-center gap-1 px-1 py-0.5 text-white">
            <Users className="size-3" />
            <span className="windows95-font text-xs">
              {t("anilist.friends.list")}
            </span>
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
                  className={`flex items-center gap-1 p-1 ${selectedId === friend.id ? "bg-surface" : ""}`}
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-1 text-left"
                    onClick={() => {
                      setSelectedId(friend.id);
                      const saved = friends.find(
                        (item) => item.id === friend.id
                      );
                      if (
                        !profiles[friend.id] &&
                        !hasFreshCachedProfile(saved)
                      ) {
                        loadProfile(friend.name);
                      }
                    }}
                  >
                    <ImageComponent
                      src={friend.avatar || "/images/user_avatar.ico"}
                      alt={friend.name}
                      className="windows95-active-border size-7 shrink-0"
                    />
                    <span className="windows95-text truncate text-xs">
                      {friend.name}
                    </span>
                  </button>
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
            <Button
              onClick={() => loadProfile(query)}
              disabled={loading || !query.trim()}
            >
              {loading ? <SmallLoader /> : <UserPlus className="size-3" />}
            </Button>
          </div>
          {error && (
            <div className="windows95-border text-destructive flex items-start gap-1 bg-white p-1 text-xs">
              <X className="mt-0.5 size-3 shrink-0" />
              <span className="windows95-text">{error}</span>
            </div>
          )}
          {selected ? (
            <div className="windows95-border min-h-0 flex-1 overflow-y-auto bg-white">
              {selected.banner_image && (
                <div className="bg-secondary h-20 overflow-hidden">
                  <ImageComponent
                    src={selected.banner_image}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </div>
              )}
              <div className="flex items-start gap-2 p-2">
                <ImageComponent
                  src={selected.avatar || "/images/user_avatar.ico"}
                  alt={selected.name}
                  className="windows95-active-border size-16 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <h3 className="windows95-text text-sm font-bold">
                    {selected.name}
                  </h3>
                  <p className="windows95-text text-xs">
                    {selected.anime_count} {t("anilist.friends.anime")} -{" "}
                    {selected.episodes_watched} {t("anilist.friends.episodes")}
                    {selected.mean_score != null &&
                      ` - ${t("anilist.friends.score")}: ${selected.mean_score}`}
                  </p>
                  <p className="windows95-text text-hint mt-1 text-xs">
                    {selected.is_following == null
                      ? t("anilist.friends.relationshipUnavailable")
                      : selected.is_following
                        ? t("anilist.friends.following")
                        : t("anilist.friends.notFollowing")}
                    {selected.is_follower === true
                      ? ` - ${t("anilist.friends.followsYou")}`
                      : ""}
                  </p>
                </div>
                <Button
                  size="icon"
                  className="size-5"
                  onClick={() => loadProfile(selected.name, true)}
                  title={t("anilist.friends.refresh")}
                >
                  <RefreshCw className="size-3" />
                </Button>
              </div>
              {selected.about && (
                <p className="windows95-text border-t border-black/20 p-2 text-xs whitespace-pre-wrap">
                  {selected.about}
                </p>
              )}
            </div>
          ) : (
            <div className="windows95-text text-hint flex flex-1 items-center justify-center p-6 text-center text-xs">
              {t("anilist.friends.help")}
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}
