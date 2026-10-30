import { useEffect, useState } from "react";

import type { StreamingEpisode } from "@/types/player/stream";

export function useStreamEpisodeSelection(
  episodes: StreamingEpisode[] | undefined,
  preferredId: string | null
) {
  const [episode, setEpisode] = useState<StreamingEpisode | null>(null);
  useEffect(() => {
    if (episode) return;
    const preferred =
      preferredId === null
        ? undefined
        : episodes?.find((candidate) => candidate.id === preferredId);
    const first = preferred ?? episodes?.[0];
    if (first) setEpisode(first);
  }, [episode, episodes, preferredId]);
  return [episode, setEpisode] as const;
}
