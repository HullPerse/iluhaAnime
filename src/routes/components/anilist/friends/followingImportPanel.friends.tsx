import { X } from "lucide-react";
import { useMemo, useState } from "react";

import { SmallLoader } from "@/components/shared/loader/small.loader";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import ImageComponent from "@/components/ui/image.component";
import { useAnilistFollowing } from "@/hooks/anilist/following.hook";
import { useI18n } from "@/hooks/i18n.hook";
import type { AniFriendMinimal } from "@/types/anilist/anilist";

export interface FollowingImportProps {
  selfId: number | null;
  addedIds: Set<number>;
  onAddMany: (friends: AniFriendMinimal[]) => void;
  onClose: () => void;
}

export function FollowingImportPanel({
  selfId,
  addedIds,
  onAddMany,
  onClose,
}: FollowingImportProps) {
  const { t } = useI18n();
  const following = useAnilistFollowing(selfId, true);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const selectable = useMemo(
    () => following.users.filter((user) => !addedIds.has(user.id)),
    [following.users, addedIds]
  );
  const selectableIds = useMemo(() => new Set(selectable.map((user) => user.id)), [selectable]);
  const effectiveCount = useMemo(
    () => [...selected].filter((id) => selectableIds.has(id)).length,
    [selected, selectableIds]
  );
  const allChecked = selectable.length > 0 && effectiveCount === selectable.length;
  const someChecked = effectiveCount > 0 && !allChecked;

  const toggleAll = (next: boolean) => {
    setSelected(next ? new Set(selectable.map((user) => user.id)) : new Set());
  };
  const toggleOne = (id: number, next: boolean) => {
    setSelected((current) => {
      const nextSet = new Set(current);
      if (next) nextSet.add(id);
      else nextSet.delete(id);
      return nextSet;
    });
  };
  const handleAdd = () => {
    const picked = following.users.filter(
      (user) => selectableIds.has(user.id) && selected.has(user.id)
    );
    if (picked.length === 0) return;
    onAddMany(picked.map((user) => ({ id: user.id, name: user.name, avatar: user.avatar })));
    setSelected(new Set());
  };

  return (
    <div className="windows95-border bg-field flex min-h-0 flex-col gap-1 p-1">
      <div className="flex items-center gap-1">
        <span className="windows95-text flex-1 text-xs font-bold">
          {t("anilist.friends.import.title")}
        </span>
        <Button
          size="icon"
          className="size-5"
          title={t("anilist.friends.import.close")}
          onClick={onClose}
        >
          <X className="size-3" />
        </Button>
      </div>
      <span className="windows95-text text-hint text-xs">{t("anilist.friends.import.hint")}</span>
      {following.isLoading ? (
        <div className="flex items-center justify-center p-4">
          <SmallLoader size={5} />
        </div>
      ) : following.error ? (
        <div className="windows95-border text-destructive bg-primary flex items-start gap-1 p-1 text-xs">
          <X className="mt-0.5 size-3 shrink-0" />
          <span className="windows95-text flex-1">
            {t("anilist.friends.import.load.error", { error: following.error })}
          </span>
          <Button onClick={() => following.retry()}>{t("anilist.friends.import.retry")}</Button>
        </div>
      ) : following.users.length === 0 ? (
        <span className="windows95-text text-hint p-2 text-center text-xs">
          {t("anilist.friends.import.empty")}
        </span>
      ) : (
        <>
          <div className="flex items-center gap-1">
            <Checkbox
              checked={allChecked}
              indeterminate={someChecked}
              onChange={toggleAll}
              aria-label={t("anilist.friends.import.select.all")}
            />
            <span className="windows95-text text-xs">
              {t("anilist.friends.import.selected", { count: effectiveCount })}
            </span>
          </div>
          <div className="flex max-h-56 min-h-0 flex-col gap-1 overflow-y-auto">
            {following.users.map((user) => {
              const added = addedIds.has(user.id);
              return (
                <div key={user.id} className="hover:bg-surface flex items-center gap-1 p-1">
                  <Checkbox
                    checked={added || selected.has(user.id)}
                    disabled={added}
                    onChange={(next) => toggleOne(user.id, next)}
                    aria-label={user.name}
                  />
                  <ImageComponent
                    src={user.avatar || "/images/user_avatar.ico"}
                    alt={user.name}
                    className="windows95-active-border size-7 shrink-0"
                  />
                  <span className="windows95-text min-w-0 flex-1 truncate text-xs">
                    {user.name}
                  </span>
                  {added && (
                    <span className="windows95-text text-hint shrink-0 text-xs">
                      {t("anilist.friends.import.added")}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-1">
            <Button onClick={handleAdd} disabled={effectiveCount === 0}>
              {t("anilist.friends.import.add")}
            </Button>
            {following.hasMore && (
              <Button onClick={() => following.loadMore()} loading={following.isFetchingMore}>
                {t("anilist.friends.import.load.more")}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
