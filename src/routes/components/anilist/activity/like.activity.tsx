import { cn } from "cn";
import { Heart } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { useToggleActivityLike } from "@/hooks/anilist/activity.hook";
import { ignore } from "@/lib/utils/promise.utils";
import type { AniActivity } from "@/types/anilist";

export function ActivityLikeButton({ activity }: { activity: AniActivity }) {
  const toggleLike = useToggleActivityLike();
  return (
    <Button
      size="icon"
      variant="ghost"
      className={cn("size-5 shrink-0", activity.is_liked && "text-destructive")}
      title={activity.is_liked ? "Unlike" : "Like"}
      aria-label={activity.is_liked ? "Unlike" : "Like"}
      aria-pressed={activity.is_liked}
      onClick={(event) => {
        event.stopPropagation();
        ignore(toggleLike(activity));
      }}
    >
      <Heart className={cn("size-3", activity.is_liked && "fill-current")} />
      {activity.like_count > 0 && (
        <span className="windows95-font text-xs tabular-nums">{activity.like_count}</span>
      )}
    </Button>
  );
}
