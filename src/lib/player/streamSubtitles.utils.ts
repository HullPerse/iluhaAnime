import { attempt, reportBackgroundError } from "@hullperse/hp_utils/attempt";

import { addStreamSubtitle } from "@/lib/player/playback.utils";
import type { StreamOpen } from "@/types/player/videoPlayer";

/**
 * Adds the soft subtitles a stream source ships with. The first default track
 * is selected, the rest are added inactive so mpv's own subtitle menu can
 * switch between them. A file load starts a new mpv entry, which drops the
 * previous external tracks, so every load adds the set again.
 *
 * `expectedPath` keeps a late answer from attaching an old episode's subtitles
 * to the file that is already playing.
 */
export async function loadStreamSubtitles(
  session: StreamOpen | null,
  isCurrent: () => boolean = () => true
): Promise<void> {
  const subtitles = session?.subtitles ?? [];

  if (subtitles.length === 0) return;

  const hasDefault = subtitles.some((subtitle) => subtitle.isDefault);
  let selected = false;

  for (const [index, subtitle] of subtitles.entries()) {
    if (!isCurrent()) return;
    const select: boolean = !selected && (subtitle.isDefault || (!hasDefault && index === 0));
    selected ||= select;
    const [, failure] = await attempt(
      addStreamSubtitle(subtitle.url, subtitle.language, select, session?.mediaUrl)
    );

    if (failure) reportBackgroundError("player.stream.subtitle", failure);
  }
}
