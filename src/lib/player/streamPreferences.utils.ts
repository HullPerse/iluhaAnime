import { streamApi } from "@/api/stream.api";
import { attempt, reportBackgroundError } from "@hullperse/hp_utils/attempt";
import { emptyPrefs } from "@/lib/player/streamPrefs.utils";
import type { StreamPrefs } from "@/types/player/stream";
import type { StreamOpen } from "@/types/player/videoPlayer";

const pending = new Map<string, Promise<void>>();

/** Serialize title preference patches; failed reads never overwrite saved preferences. */
export function rememberStreamPrefs(
  session: StreamOpen,
  patch: Partial<StreamPrefs>
): Promise<void> {
  const key = JSON.stringify([session.sourceId, session.mediaId]);
  const run = async () => {
    const [, failure] = await attempt(
      (async () => {
        const saved = await streamApi.prefsGet(session.sourceId, session.mediaId);
        const base = saved ?? emptyPrefs(session.sourceId, session.mediaId);
        await streamApi.prefsSave(
          { ...base, ...patch, sourceId: session.sourceId, mediaId: session.mediaId },
          Object.keys(patch)
        );
      })()
    );

    if (failure) reportBackgroundError("player.stream.prefs", failure);
  };

  const next = (pending.get(key) ?? Promise.resolve()).then(run);
  pending.set(key, next);

  return next.finally(() => {
    if (pending.get(key) === next) pending.delete(key);
  });
}
