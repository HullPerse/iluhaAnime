import { cn } from "cn";

import { TMDB_LIMIT } from "@/config/collection/defaults.config";
import { useTmdbRateLimit } from "@/hooks/collection/tmdb.hook";

export function TmdbBadge() {
  const rate = useTmdbRateLimit();
  if (rate.remaining == null) return null;
  const limited = rate.retryAfterSecs != null;
  return (
    <span
      className={cn(
        "ml-auto text-xs font-bold",
        limited ? "text-destructive" : rate.remaining < 5 ? "text-orange-500" : "text-hint"
      )}
      title={rate.resetAt ? new Date(rate.resetAt).toLocaleTimeString() : undefined}
    >
      TMDB {rate.remaining}/{TMDB_LIMIT}
      {limited ? ` ${rate.retryAfterSecs}s` : ""}
    </span>
  );
}
