import { cn } from "cn";

import { TMDB_LIMIT } from "@/config/anilist/collectionDefaults.config";
import { useTmdbRateLimit } from "@/hooks/collection/tmdb.hook";

export function TmdbBadge() {
  const rate = useTmdbRateLimit();
  if (rate.remaining == null) return null;
  const limited = rate.retryAfterSecs != null;
  let tone = "text-hint";
  if (limited) tone = "text-destructive";
  else if (rate.remaining < 5) tone = "text-orange-500";
  return (
    <span
      className={cn(
        "ml-auto text-xs font-bold",
        tone
      )}
      title={rate.resetAt ? new Date(rate.resetAt).toLocaleTimeString() : undefined}
    >
      TMDB {rate.remaining}/{TMDB_LIMIT}
      {limited ? ` ${rate.retryAfterSecs}s` : ""}
    </span>
  );
}
