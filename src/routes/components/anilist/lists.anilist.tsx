import { useCallback, useEffect, useState } from "react";

import { SmallLoader } from "@/components/shared/loader.component";
import ImageComponent from "@/components/ui/image.component";
import { anilistProxyArgs } from "@/lib/anilist/proxy.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { useSettingsStore } from "@/store/settings.store";
import type { AniListCollection } from "@/types/anilist";

export function FriendListsView({
  friendId,
  onAnime,
}: {
  friendId: number;
  onAnime: (id: number) => void;
}) {
  const { t } = useI18n();
  const [lists, setLists] = useState<AniListCollection[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadFriendLists = useCallback(() => {
    setLists(null);
    setError(null);
    invokeTyped<AniListCollection[]>("get_anilist_lists", {
      userId: friendId,
      ...anilistProxyArgs(useSettingsStore.getState().anilistProxyUrl),
    })
      .then((result) => setLists(result))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, [friendId]);

  useEffect(() => {
    loadFriendLists();
  }, [loadFriendLists]);
  if (error) {
    return (
      <div className="windows95-text text-destructive p-2 text-xs">
        {error} -{" "}
        <button type="button" className="underline" onClick={loadFriendLists}>
          {t("anilist.details.retry")}
        </button>
      </div>
    );
  }
  if (!lists) {
    return (
      <div className="flex justify-center p-4">
        <SmallLoader />
      </div>
    );
  }
  const nonEmpty = lists.filter((list) => list.entries.length > 0);
  if (nonEmpty.length === 0) {
    return (
      <div className="windows95-text text-hint p-2 text-xs">{t("anilist.friends.lists.empty")}</div>
    );
  }
  return (
    <div className="flex min-h-0 flex-col gap-2 overflow-y-auto p-2">
      {nonEmpty.map((list) => (
        <section key={list.name}>
          <h4 className="windows95-text text-xs font-bold">
            {list.name} ({list.entries.length})
          </h4>
          <div className="mt-0.5 flex flex-col gap-0.5">
            {list.entries.map((entry) => (
              <button
                key={entry.media.id}
                type="button"
                onClick={() => onAnime(entry.media.id)}
                title={entry.media.title}
                className="hover:bg-surface flex min-w-0 items-center gap-1 p-0.5 text-left"
              >
                {entry.media.cover_url && (
                  <ImageComponent
                    src={entry.media.cover_url}
                    alt=""
                    className="windows95-active-border h-10 w-7 shrink-0"
                  />
                )}
                <span className="windows95-text min-w-0 flex-1 truncate text-xs">
                  {entry.media.title}
                </span>
                {(entry.progress != null || entry.score != null) && (
                  <span className="text-hint shrink-0 text-xs">
                    {entry.progress ?? "-"}
                    {entry.score != null && entry.score !== 0 ? ` - ${entry.score}/10` : ""}
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
