import { Frown, Meh, Smile, Star } from "lucide-react";

import { scoreIconFor } from "@/lib/anilist/anilistScore.utils";

export function FriendScoreIcon({ score }: { score: number | null }) {
  const icon = scoreIconFor("POINT_3", score);
  if (icon === "frown") return <Frown className="size-3.5" />;
  if (icon === "meh") return <Meh className="size-3.5" />;
  if (icon === "smile") return <Smile className="size-3.5" />;
  return <Star className="size-3 fill-yellow-400 text-yellow-600" />;
}
