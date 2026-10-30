import { cn } from "cn";
import { ArrowLeftRight, List, Trash2, UserPlus, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { anilistApi } from "@/api/anilist.api";
import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { Input } from "@/components/ui/input.component";
import { useI18n } from "@/hooks/i18n.hook";
import { hasFreshCachedProfile } from "@/lib/core/friends.utils";
import { attempt } from "@/lib/core/attempt.utils";
import { enterSubmit } from "@/lib/ui/keyboard.utils";
import { ignore } from "@/lib/core/promise.utils";
import { cacheAnilistProfile } from "@/store/anilist.store";
import type { ActivityDetailBundle } from "@/types/anilist/anilist";
import type { AniFriend, AniUserProfile } from "@/types/anilist/anilist";
import type { AniFriendsProps as Props } from "@/types/anilist/anilist";

import { InlineDetail } from "@/routes/components/anilist/detail/inline.detail";
import { ViewTabs, type FriendView } from "@/routes/components/anilist/friends/viewTabs.friends";
import { ComparePanel } from "@/routes/components/anilist/friends/comparePanel.friends";
import { FriendPreview } from "@/routes/components/anilist/friends/friendPreview.friends";
import { FollowingImportPanel } from "@/routes/components/anilist/friends/followingImportPanel.friends";

export default function AniListFriendsModal({
  friends,
  selfUser,
  selfLists,
  selfFavourites,
  onAdd,
  onAddMany,
  onRemove,
  onViewLists,
  detail,
  onClose,
}: Props & { detail: ActivityDetailBundle }) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [profiles, setProfiles] = useState<Record<number, AniUserProfile>>({});
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<FriendView>("profile");
  const [detailId, setDetailId] = useState<number | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const addedIds = useMemo(() => new Set(friends.map((friend) => friend.id)), [friends]);

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
    cacheAnilistProfile(profile);
  };

  const selectFriend = (friend: AniFriend) => {
    setSelectedId(friend.id);
    setProfileError(null);
    if (!profiles[friend.id] && friend.profile) {
      const cached = friend.profile;
      setProfiles((current) => ({ ...current, [friend.id]: cached }));
    }
    if (!hasFreshCachedProfile(friend)) ignore(fetchProfile(friend));
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

  const compareTarget = view === "compare" ? (selectedFriend ?? null) : null;

  const compareFriend = (friend: AniFriend) => {
    selectFriend(friend);
    setView("compare");
  };

  if (detailId != null) {
    return (
      <InlineDetail
        initialId={detailId}
        detail={detail}
        onBack={() => setDetailId(null)}
        onClose={onClose}
      />
    );
  }

  return (
    <Modal
      header={t("anilist.friends.title")}
      onClose={onClose}
      className="w-4xl max-w-[92vw]"
      contentClassName="min-h-0 overflow-hidden!"
    >
      <div className="grid min-h-80 flex-1 grid-cols-1 gap-2 md:grid-cols-[minmax(13rem,0.8fr)_minmax(0,1.4fr)]">
        <section className="windows95-border bg-field flex min-h-0 flex-col p-1">
          <div className="bg-secondary text-title-text mb-1 flex shrink-0 items-center gap-1 px-1 py-0.5">
            <Users className="size-3" />
            <span className="windows95-font text-xs">{t("anilist.friends.list")}</span>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
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
                    title={t("anilist.compare.open")}
                    aria-label={t("anilist.compare.open")}
                    onClick={() => compareFriend(friend)}
                  >
                    <ArrowLeftRight className="size-3" />
                  </Button>
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

        <section className="windows95-border bg-primary flex min-h-0 min-w-0 flex-col gap-2 p-2">
          <div className="flex shrink-0 gap-1">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={enterSubmit(() => loadProfile(query))}
              placeholder={t("anilist.friends.placeholder")}
              className="min-w-0 flex-1"
            />
            <Button onClick={() => loadProfile(query)} disabled={!query.trim()} loading={loading}>
              <UserPlus className="size-3" />
            </Button>
            {selfUser && (
              <Button
                title={t("anilist.friends.import.button")}
                aria-label={t("anilist.friends.import.button")}
                onClick={() => setImportOpen((open) => !open)}
              >
                <Users className="size-3" />
              </Button>
            )}
          </div>
          {importOpen && selfUser && (
            <FollowingImportPanel
              selfId={selfUser.id}
              addedIds={addedIds}
              onAddMany={onAddMany}
              onClose={() => setImportOpen(false)}
            />
          )}
          {error && (
            <div className="windows95-border text-destructive bg-field flex shrink-0 items-start gap-1 p-1 text-xs">
              <X className="mt-0.5 size-3 shrink-0" />
              <span className="windows95-text">{error}</span>
            </div>
          )}
          {selectedId !== null && <ViewTabs view={view} onChange={setView} />}
          <div className="flex min-h-0 flex-1 flex-col">
            {compareTarget ? (
              <ComparePanel
                friend={compareTarget}
                profile={selectedProfile}
                selfUser={selfUser}
                selfLists={selfLists}
                selfFavourites={selfFavourites}
                onAnimeClick={setDetailId}
              />
            ) : (
              <FriendPreview
                friend={selectedFriend}
                profile={selectedProfile}
                profileError={profileError}
                refreshing={refreshing}
                hasSelection={selectedId !== null}
                onViewLists={onViewLists}
                onRefresh={(force) => {
                  if (selectedFriend) ignore(fetchProfile(selectedFriend, force));
                }}
              />
            )}
          </div>
        </section>
      </div>
    </Modal>
  );
}
